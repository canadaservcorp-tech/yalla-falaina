// Bookings — a seeker reserves a slot and the deposit is *held* on PayPal, never
// charged up front: authorize at booking time, capture only when the job is done
// or when the seeker cancels late, void in every other case.
//
// Money never comes from the client: the deposit is derived from the quote by
// lib/booking-rules.js, and PayPal is always asked for that server-side amount.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { configured, pp } = require('../lib/paypal');
const { notify } = require('../lib/notify');
const sec = require('../lib/security');
const R = require('../lib/booking-rules');
const router = express.Router();

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const MAX_NOTE = 500;
const MAX_QUOTED_CENTS = 5000000;      // $50,000 — a quote beyond this is a typo

const FIELDS = 'id, provider_id, seeker_id, scheduled_at, quoted_cents, deposit_cents, note, status,' +
  ' cancelled_by, authorize_from, paypal_order_id, paypal_authorization_id, auth_expires_at, created_at';

const shape = (b, viewerId) => ({
  id: b.id,
  role: b.seeker_id === viewerId ? 'seeker' : 'provider',
  otherId: b.seeker_id === viewerId ? b.provider_id : b.seeker_id,
  scheduledAt: b.scheduled_at,
  quoted: R.money(b.quoted_cents),
  deposit: R.money(b.deposit_cents),
  note: b.note || '',
  status: b.status,
  cancelledBy: b.cancelled_by || null,
  authorizeFrom: b.authorize_from,
  canAuthorize: b.status === 'accepted' && new Date(b.authorize_from).getTime() <= Date.now(),
  lateCancel: R.cancelIsLate(b.scheduled_at),
});

const load = async (id, userId) => {
  const { data } = await supabase.from('bookings').select(FIELDS).eq('id', id).maybeSingle();
  if (!data) return null;
  if (data.seeker_id !== userId && data.provider_id !== userId) return null;
  return data;
};

const patch = (id, fields) => supabase.from('bookings')
  .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);

// Releasing or taking the held deposit. A hold that PayPal has already dropped
// must not block the booking's own state change, so failures are reported, not thrown.
async function releaseHold(b) {
  if (!b.paypal_authorization_id) return { ok: true };
  try {
    await pp('POST', `/v2/payments/authorizations/${b.paypal_authorization_id}/void`);
    return { ok: true };
  } catch (e) { console.error('booking void', e.message); return { ok: false, error: e.message }; }
}
async function takeHold(b) {
  if (!b.paypal_authorization_id) return { ok: false, error: 'No authorization on this booking' };
  try {
    await pp('POST', `/v2/payments/authorizations/${b.paypal_authorization_id}/capture`, {
      amount: { currency_code: 'CAD', value: R.money(b.deposit_cents) },
      final_capture: true,
    });
    return { ok: true };
  } catch (e) { console.error('booking capture', e.message); return { ok: false, error: e.message }; }
}

// GET /api/bookings/policy?amount=250.00 — the rules and the deposit they produce
router.get('/policy', (req, res) => {
  const cents = Math.round(Number(req.query.amount) * 100);
  const quoted = Number.isSafeInteger(cents) && cents > 0 ? Math.min(cents, MAX_QUOTED_CENTS) : 0;
  const deposit = quoted ? R.depositCents(quoted) : R.MIN_CENTS;
  res.json({
    success: true,
    version: R.POLICY_VERSION,
    depositCents: deposit,
    deposit: R.money(deposit),
    freeCancelHours: R.FREE_CANCEL_MS / 3600000,
    fr: R.policyText('fr', deposit),
    en: R.policyText('en', deposit),
  });
});

// POST /api/bookings  { providerId, scheduledAt, amount, note, acceptPolicy }
router.post('/', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (req.user.role !== 'seeker') return res.status(403).json({ error: 'Only seekers can book' });
    if (!sec.isId(req.body.providerId)) return res.status(400).json({ error: 'Invalid provider' });
    const providerId = Number(req.body.providerId);
    if (providerId === req.user.id) return res.status(400).json({ error: 'Cannot book yourself' });
    if (req.body.acceptPolicy !== true)
      return res.status(400).json({ error: 'The booking policy must be accepted' });

    const when = new Date(req.body.scheduledAt);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid date' });
    const lead = when.getTime() - Date.now();
    if (lead < R.MIN_LEAD_MS) return res.status(400).json({ error: 'Choose a slot at least 2 hours from now' });
    if (lead > R.MAX_LEAD_MS) return res.status(400).json({ error: 'Choose a slot within the next 6 months' });

    const quotedCents = Math.round(Number(req.body.amount) * 100);
    if (!Number.isSafeInteger(quotedCents) || quotedCents <= 0 || quotedCents > MAX_QUOTED_CENTS)
      return res.status(400).json({ error: 'Invalid estimated price' });

    const { data: prov } = await supabase.from('providers')
      .select('user_id, claimed').eq('user_id', providerId).maybeSingle();
    if (!prov || prov.claimed === false) return res.status(404).json({ error: 'Provider not found' });
    const { data: pu } = await supabase.from('users')
      .select('id, banned').eq('id', providerId).maybeSingle();
    if (!pu || pu.banned) return res.status(404).json({ error: 'Provider not found' });

    // the price is agreed in chat, so a booking presupposes a conversation
    const { data: conv } = await supabase.from('conversations').select('id')
      .eq('seeker_id', req.user.id).eq('provider_id', providerId).maybeSingle();
    if (!conv) return res.status(403).json({ error: 'Message the provider before booking' });

    const row = {
      provider_id: providerId,
      seeker_id: req.user.id,
      scheduled_at: when.toISOString(),
      quoted_cents: quotedCents,
      deposit_cents: R.depositCents(quotedCents),
      note: sec.clean(req.body.note, MAX_NOTE) || '',
      status: 'requested',
      authorize_from: R.authorizeFrom(when).toISOString(),
      policy_version: R.POLICY_VERSION,
      policy_accepted_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('bookings').insert(row).select(FIELDS).maybeSingle();
    // the partial unique index refuses a second live booking on the same slot
    if (error) {
      console.error('booking insert', error.message);
      return res.status(409).json({ error: 'That slot is no longer available' });
    }
    await notify(providerId, 'booking_requested');
    res.json({ success: true, booking: data ? shape(data, req.user.id) : null });
  } catch (e) { console.error('booking create', e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/bookings — mine, as seeker or provider
router.get('/', authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const column = req.user.role === 'provider' ? 'provider_id' : 'seeker_id';
    const { data, error } = await supabase.from('bookings').select(FIELDS)
      .eq(column, req.user.id).order('scheduled_at', { ascending: false }).limit(100);
    if (error) { console.error('booking list', error.message); return res.status(500).json({ error: 'Server error' }); }
    res.json({ success: true, bookings: (Array.isArray(data) ? data : []).map(b => shape(b, req.user.id)) });
  } catch (e) { console.error('booking list', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/bookings/:id/accept | /decline — provider's answer to the request
const answer = accepted => async (req, res) => {
  try {
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid booking' });
    const b = await load(Number(req.params.id), req.user.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (b.provider_id !== req.user.id) return res.status(403).json({ error: 'Providers only' });
    if (b.status !== 'requested') return res.status(409).json({ error: 'This booking was already answered' });

    const status = accepted ? 'accepted' : 'declined';
    const { error } = await patch(b.id, { status });
    if (error) { console.error('booking answer', error.message); return res.status(500).json({ error: 'Server error' }); }
    await notify(b.seeker_id, accepted ? 'booking_accepted' : 'booking_declined');
    res.json({ success: true, status });
  } catch (e) { console.error('booking answer', e); res.status(500).json({ error: 'Server error' }); }
};
router.post('/:id/accept', authenticate, sec.requireActiveUser, sec.limits.write, answer(true));
router.post('/:id/decline', authenticate, sec.requireActiveUser, sec.limits.write, answer(false));

// POST /api/bookings/:id/authorize — seeker starts the hold; returns PayPal's approval URL
router.post('/:id/authorize', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid booking' });
    if (!configured()) return res.status(500).json({ error: 'PayPal not configured' });
    const b = await load(Number(req.params.id), req.user.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (b.seeker_id !== req.user.id) return res.status(403).json({ error: 'Seekers only' });
    if (b.status !== 'accepted') return res.status(409).json({ error: 'This booking cannot be authorized' });
    // holding earlier would let the authorization lapse before the appointment
    if (new Date(b.authorize_from).getTime() > Date.now())
      return res.status(409).json({ error: 'The deposit can only be authorized closer to the appointment' });

    const order = await pp('POST', '/v2/checkout/orders', {
      intent: 'AUTHORIZE',
      purchase_units: [{
        custom_id: `booking:${b.id}`,
        description: 'TrouvePro — dépôt de réservation',
        amount: { currency_code: 'CAD', value: R.money(b.deposit_cents) },
      }],
      application_context: {
        brand_name: 'TrouvePro',
        user_action: 'PAY_NOW',
        return_url: `${PUBLIC_URL}/?booking=${b.id}`,
        cancel_url: `${PUBLIC_URL}/?booking=cancel`,
      },
    });
    await patch(b.id, { paypal_order_id: order.id });
    const approve = (order.links || []).find(l => l.rel === 'approve' || l.rel === 'payer-action');
    if (!approve) return res.status(500).json({ error: 'PayPal returned no approval link' });
    res.json({ success: true, url: approve.href, orderId: order.id });
  } catch (e) { console.error('booking authorize', e); res.status(500).json({ error: 'Could not start the deposit hold' }); }
});

// POST /api/bookings/:id/confirm  { orderId } — seeker is back from PayPal; place the hold
router.post('/:id/confirm', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid booking' });
    const b = await load(Number(req.params.id), req.user.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (b.seeker_id !== req.user.id) return res.status(403).json({ error: 'Seekers only' });
    if (b.status === 'authorized') return res.json({ success: true, status: 'authorized' });
    if (b.status !== 'accepted') return res.status(409).json({ error: 'This booking cannot be authorized' });
    // only the order this booking created counts, so someone else's order cannot be replayed here
    if (!b.paypal_order_id || String(req.body.orderId) !== b.paypal_order_id)
      return res.status(400).json({ error: 'Unknown PayPal order' });

    const j = await pp('POST', `/v2/checkout/orders/${b.paypal_order_id}/authorize`, {});
    const a = (((j.purchase_units || [])[0] || {}).payments || {}).authorizations || [];
    const held = a[0];
    if (!held || !held.id) return res.status(502).json({ error: 'PayPal did not confirm the hold' });

    const { error } = await patch(b.id, {
      status: 'authorized',
      paypal_authorization_id: held.id,
      auth_expires_at: held.expiration_time || null,
    });
    if (error) {
      // the money is held but we failed to record it: release rather than keep a hold we cannot track
      await releaseHold({ paypal_authorization_id: held.id, deposit_cents: b.deposit_cents });
      console.error('booking confirm', error.message);
      return res.status(500).json({ error: 'Server error' });
    }
    await notify(b.provider_id, 'booking_confirmed');
    res.json({ success: true, status: 'authorized' });
  } catch (e) { console.error('booking confirm', e); res.status(500).json({ error: 'Could not hold the deposit' }); }
});

// POST /api/bookings/:id/cancel — who cancels and how late decides who pays
router.post('/:id/cancel', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid booking' });
    const b = await load(Number(req.params.id), req.user.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (!['requested', 'accepted', 'authorized'].includes(b.status))
      return res.status(409).json({ error: 'This booking is closed' });

    const byProvider = b.provider_id === req.user.id;
    // a provider's cancellation always costs the seeker nothing; a seeker pays only when late
    const charge = !byProvider && R.cancelIsLate(b.scheduled_at) && b.status === 'authorized';
    const money = charge ? await takeHold(b) : await releaseHold(b);
    if (!money.ok && charge) return res.status(502).json({ error: 'Could not charge the deposit — try again' });

    const { error } = await patch(b.id, {
      status: charge ? 'cancelled_charged' : 'cancelled_void',
      cancelled_by: byProvider ? 'provider' : 'seeker',
    });
    if (error) { console.error('booking cancel', error.message); return res.status(500).json({ error: 'Server error' }); }
    await notify(byProvider ? b.seeker_id : b.provider_id, 'booking_cancelled');
    res.json({ success: true, status: charge ? 'cancelled_charged' : 'cancelled_void', charged: charge });
  } catch (e) { console.error('booking cancel', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/bookings/:id/complete — provider confirms the job; the held deposit is captured
router.post('/:id/complete', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid booking' });
    const b = await load(Number(req.params.id), req.user.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (b.provider_id !== req.user.id) return res.status(403).json({ error: 'Providers only' });
    if (b.status !== 'authorized') return res.status(409).json({ error: 'No deposit is held on this booking' });

    const money = await takeHold(b);
    if (!money.ok) return res.status(502).json({ error: 'Could not capture the deposit — try again' });
    const { error } = await patch(b.id, { status: 'completed' });
    if (error) { console.error('booking complete', error.message); return res.status(500).json({ error: 'Server error' }); }
    await notify(b.seeker_id, 'booking_completed');
    res.json({ success: true, status: 'completed' });
  } catch (e) { console.error('booking complete', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/bookings/:id/no-show — the absent side decides the outcome
router.post('/:id/no-show', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid booking' });
    const b = await load(Number(req.params.id), req.user.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (b.status !== 'authorized') return res.status(409).json({ error: 'No deposit is held on this booking' });
    if (new Date(b.scheduled_at).getTime() > Date.now())
      return res.status(409).json({ error: 'The appointment has not happened yet' });

    // reported by the provider: the seeker did not show, deposit captured.
    // reported by the seeker: the provider did not show, hold released in full.
    const byProvider = b.provider_id === req.user.id;
    const money = byProvider ? await takeHold(b) : await releaseHold(b);
    if (!money.ok && byProvider) return res.status(502).json({ error: 'Could not charge the deposit — try again' });

    const { error } = await patch(b.id, {
      status: byProvider ? 'cancelled_charged' : 'cancelled_void',
      cancelled_by: byProvider ? 'seeker' : 'provider',
    });
    if (error) { console.error('booking no-show', error.message); return res.status(500).json({ error: 'Server error' }); }
    await notify(byProvider ? b.seeker_id : b.provider_id, 'booking_cancelled');
    res.json({ success: true, status: byProvider ? 'cancelled_charged' : 'cancelled_void', charged: byProvider });
  } catch (e) { console.error('booking no-show', e); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
module.exports.releaseHold = releaseHold;
