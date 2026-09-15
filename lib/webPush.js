// Web Push wrapper — the one place that touches the `web-push` library and
// the VAPID keypair, so routes/push.js and lib/jobAlerts.js never have to.
// Deliberately a thin wrapper (same house style as lib/paypal.js/lib/stripe.js's
// own thin wrappers) rather than reimplementing the aes128gcm payload
// encryption by hand — unlike those two REST APIs, Web Push's encryption is
// genuine, easy-to-get-subtly-wrong cryptography, exactly the kind of thing a
// maintained, widely-used library exists for.
const webpush = require('web-push');
const supabase = require('../db');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
// mailto: is required by the VAPID spec (RFC 8292) as a contact a push
// service can reach if it needs to flag abuse -- falls back to the same
// operator inbox the rest of the app already uses (routes/auth.js's signup
// notification, routes/contact.js), never a placeholder.
const CONTACT = process.env.VAPID_CONTACT_EMAIL || process.env.NOTIFY_EMAIL || process.env.CONTACT_EMAIL || '';

const configured = () => Boolean(PUBLIC_KEY && PRIVATE_KEY);

let configuredOnce = false;
function ensureConfigured() {
  if (configuredOnce || !configured()) return;
  webpush.setVapidDetails(`mailto:${CONTACT || 'no-reply@example.invalid'}`, PUBLIC_KEY, PRIVATE_KEY);
  configuredOnce = true;
}

const publicKey = () => PUBLIC_KEY;

// sub: a push_subscriptions row ({ endpoint, p256dh, auth }). Deletes the
// subscription itself on a 404/410 (the browser or the user has permanently
// unsubscribed -- gone, this push service will never accept it again) so a
// stale row can't keep failing on every future ingest run forever. Never
// throws -- one dead subscription must not stop the batch lib/jobAlerts.js
// is sending, the same "a side effect failing must not fail the caller"
// discipline as lib/voiceNotes.js's cleanup calls.
async function sendNotification(sub, payload) {
  if (!configured()) return { sent: false, reason: 'not_configured' };
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { sent: true };
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      try { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }
      catch (delErr) { console.error('webPush: cleanup of gone subscription', delErr.message); }
      return { sent: false, reason: 'gone' };
    }
    console.error('webPush: send failed', e.message);
    return { sent: false, reason: 'error' };
  }
}

module.exports = { configured, publicKey, sendNotification };
