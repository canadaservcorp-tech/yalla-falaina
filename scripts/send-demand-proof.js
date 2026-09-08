// TrouvePro — weekly proof-of-leads follow-up.
//
// Usage: node scripts/send-demand-proof.js --dry-run        # print the first message, send nothing
//        node scripts/send-demand-proof.js --limit 25       # follow up 25 contacts
//        node scripts/send-demand-proof.js --min 3 --days 7 # only where 3+ searches happened
//
// A contractor does not subscribe because a platform exists; he subscribes because clients are
// already looking for him there. This sends that number and nothing else — counted from real
// searches near his own listing, so if the number is small the message is not sent at all.
//
// Same CASL rules as the invitation: legal name, postal address, working reply address, one-click
// unsubscribe. Contacts that unsubscribed, bounced or already claimed are excluded by the view.
require('dotenv').config();
const supabase = require('../db');
const demand = require('../lib/demand');
const { sendEmail } = require('../lib/email');

const SITE = (process.env.PUBLIC_URL || 'https://www.mytrouvepro.net').replace(/\/$/, '');
const POSTAL = process.env.OUTREACH_POSTAL_ADDRESS;
const REPLY_TO = process.env.OUTREACH_REPLY_TO || 'canada.servcorp@gmail.com';
const BCC = process.env.OUTREACH_BCC || null;
const INSTAGRAM = 'https://www.instagram.com/mytrouvepro';
const LEGAL_NAME = 'Performance Cristal Technologies Avancées S.A. (NEQ 2280629637)';
const GAP_MS = 1200;
const RADIUS_KM = 15;
// Days between two follow-ups to the same contact: a monthly rhythm, never weekly nagging.
const COOLDOWN_DAYS = 30;

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function message(contact, searches, days) {
  const en = contact.lang === 'en';
  const name = esc(contact.business_name || (en ? 'your business' : 'votre entreprise'));
  const city = esc(contact.city || (en ? 'your area' : 'votre secteur'));
  const target = contact.rbq_licence
    ? `${SITE}/fiche/${encodeURIComponent(contact.rbq_licence)}?t=${contact.unsubscribe_token}&utm_source=proof_email`
    : `${SITE}/?claim=${contact.unsubscribe_token}&utm_source=proof_email`;
  const stop = `${SITE}/api/outreach/unsubscribe?token=${contact.unsubscribe_token}`;
  const subject = en
    ? `${searches} clients searched for your trade near ${contact.city || 'you'}`
    : `${searches} clients ont cherché votre métier près de ${contact.city || 'chez vous'}`;

  const button = `<p style="margin:26px 0"><a href="${target}" style="background:#0f7c7b;color:#fff;`
    + `text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:600;display:inline-block">`
    + (en ? 'Claim my listing' : 'Réclamer ma fiche') + `</a></p>`;

  const body = en ? `
    <p>Hello,</p>
    <p>In the last ${days} days, <strong>${searches} searches</strong> for your trade happened within
       ${RADIUS_KM} km of ${city} on TrouvePro.</p>
    <p><strong>${name}</strong> appears in those results — but the listing is unclaimed, so clients
       cannot contact you through it.</p>
    <p>Claiming is free. Being contactable is $5.49/month for the first 3 months, then $10.66/month,
       cancel anytime.</p>
    ${button}`
    : `
    <p>Bonjour,</p>
    <p>Ces ${days} derniers jours, <strong>${searches} recherches</strong> pour votre métier ont eu
       lieu à moins de ${RADIUS_KM} km de ${city} sur TrouvePro.</p>
    <p><strong>${name}</strong> apparaît dans ces résultats — mais la fiche n'est pas réclamée, donc
       les clients ne peuvent pas vous joindre.</p>
    <p>Réclamer est gratuit. Être joignable : 5,49 $/mois les 3 premiers mois, puis 10,66 $/mois,
       annulable en tout temps.</p>
    ${button}`;

  const links = `<p style="font-size:13px;color:#555">`
    + (en
      ? `<a href="${SITE}/?subscribe=1&utm_source=proof_email" style="color:#0f7c7b">See the subscription</a>`
        + ` &nbsp;·&nbsp; <a href="${INSTAGRAM}" style="color:#0f7c7b">Follow TrouvePro on Instagram</a>`
      : `<a href="${SITE}/?subscribe=1&utm_source=proof_email" style="color:#0f7c7b">Voir l'abonnement</a>`
        + ` &nbsp;·&nbsp; <a href="${INSTAGRAM}" style="color:#0f7c7b">Suivez TrouvePro sur Instagram</a>`)
    + `</p>`;

  const footer = en ? `
    <hr style="border:none;border-top:1px solid #ddd;margin:22px 0">
    <p style="font-size:12px;color:#666">
      Sent by ${LEGAL_NAME}, ${esc(POSTAL)}.<br>
      You received this because your business contact information is published in the RBQ licence
      register. Reply to ${esc(REPLY_TO)} or <a href="${stop}">unsubscribe</a> — one click.
    </p>`
    : `
    <hr style="border:none;border-top:1px solid #ddd;margin:22px 0">
    <p style="font-size:12px;color:#666">
      Envoyé par ${LEGAL_NAME}, ${esc(POSTAL)}.<br>
      Vous recevez ce courriel parce que les coordonnées de votre entreprise sont publiées au
      registre des licences RBQ. Répondez à ${esc(REPLY_TO)} ou
      <a href="${stop}">désabonnez-vous</a> — un seul clic.
    </p>`;

  const html = `<!doctype html><html lang="${en ? 'en' : 'fr'}"><body style="font-family:system-ui,sans-serif;`
    + `font-size:15px;line-height:1.5;color:#0a3538;max-width:560px">${body}${links}${footer}</body></html>`;
  return { subject, html };
}

// The listing behind a contact, with its coordinates and trades: the count has to be measured
// around the provider we are actually writing about.
async function listingFor(licence) {
  if (!licence) return null;
  const { data, error } = await supabase.from('providers')
    .select('user_id, lat, lng, claimed').eq('rbq_licence', licence).maybeSingle();
  if (error) throw error;
  if (!data || data.claimed || !Number.isFinite(Number(data.lat))) return null;
  const svc = await supabase.from('provider_services')
    .select('profession_id').eq('provider_id', data.user_id);
  if (svc.error) throw svc.error;
  return {
    lat: Number(data.lat), lng: Number(data.lng),
    professionIds: (svc.data || []).map(s => s.profession_id),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const num = (flag, def) => {
    const i = args.indexOf(flag);
    if (i < 0) return def;
    const v = Number(args[i + 1]);
    if (!Number.isInteger(v) || v < 1) throw new Error(`${flag} must be a positive integer`);
    return v;
  };
  const limit = num('--limit', 25);
  const days = num('--days', 7);
  const min = num('--min', 3);
  if (limit > 200) throw new Error('--limit must be 1..200: this is a slow drip, not a blast');
  if (!POSTAL) throw new Error('OUTREACH_POSTAL_ADDRESS is required: CASL needs a postal address in every message');
  if (!dry && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is unset — emails would only print');

  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 864e5).toISOString();
  const { data: contacts, error } = await supabase.from('outreach_sendable')
    .select('id, email, business_name, city, lang, rbq_licence, unsubscribe_token, proof_count, proof_sent_at')
    .not('rbq_licence', 'is', null)
    .or(`proof_sent_at.is.null,proof_sent_at.lt.${cutoff}`)
    .order('proof_sent_at', { ascending: true, nullsFirst: true })
    .limit(limit * 4);
  if (error) throw error;

  let sent = 0, failed = 0, skipped = 0;
  for (const c of contacts || []) {
    if (sent >= limit) break;
    let searches = 0;
    try {
      const listing = await listingFor(c.rbq_licence);
      if (!listing) { skipped++; continue; }
      searches = await demand.near({
        lat: listing.lat, lng: listing.lng, radiusKm: RADIUS_KM,
        professionIds: listing.professionIds, days,
      });
    } catch (e) { failed++; console.error('demand lookup', c.email, e.message); continue; }
    // No demand, no message: an invented or trivial number is what destroys the only argument
    // we have with these contractors.
    if (searches < min) { skipped++; continue; }

    const m = message(c, searches, days);
    if (dry) {
      console.log(`would send to ${c.email} (${searches} searches)\n\n${m.subject}\n\n${m.html}`);
      return;
    }
    try {
      await sendEmail(c.email, m.subject, m.html, { replyTo: REPLY_TO, bcc: BCC });
      const upd = await supabase.from('outreach_contacts')
        .update({ proof_sent_at: new Date().toISOString(), proof_count: (c.proof_count || 0) + 1 })
        .eq('id', c.id);
      if (upd.error) console.error('proof mark sent', c.email, upd.error.message);
      sent++;
    } catch (e) { failed++; console.error('send failed', c.email, e.message); }
    await new Promise(r => setTimeout(r, GAP_MS));
  }
  if (dry && !sent) console.log(`nothing to send: no contact reached ${min} searches in ${days} days`);
  else console.log(`proof-of-leads: ${sent} sent, ${skipped} skipped (too little demand), ${failed} failed`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { message };
