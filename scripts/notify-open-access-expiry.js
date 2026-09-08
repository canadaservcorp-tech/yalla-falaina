// "Your free reachability ends in X days, and Y people looked at your listing."
//
//   node scripts/notify-open-access-expiry.js --dry-run
//   node scripts/notify-open-access-expiry.js --limit 25 [--min-activity 1] [--sms]
//
// Sent to unclaimed listings inside the open-access window, once, near the end of it. The numbers
// are read from listing_views / listing_leads — a listing nobody looked at gets no message, because
// an invented number is the fastest way to lose a contractor for good.
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const leads = require('../lib/leads');
const openAccess = require('../lib/open-access');
const sms = require('../lib/sms');

const SITE = (process.env.PUBLIC_URL || 'https://www.mytrouvepro.net').replace(/\/$/, '');
const REPLY_TO = process.env.OUTREACH_REPLY_TO || 'canada.servcorp@gmail.com';
const BCC = process.env.OUTREACH_BCC || 'canada.servcorp@gmail.com';
const POSTAL = process.env.OUTREACH_POSTAL_ADDRESS;
const GAP_MS = 4000;
const COOLDOWN_DAYS = 14;

function message({ business, city, views, leadCount, licence, lang, until, daysLeft, token }) {
  const en = lang === 'en';
  const claim = `${SITE}/fiche/${encodeURIComponent(licence)}?utm_source=open_access_expiry`;
  const counts = en
    ? `${views} ${views === 1 ? 'person' : 'people'} looked at your listing`
      + (leadCount ? ` and ${leadCount} ${leadCount === 1 ? 'request' : 'requests'} came in` : '')
    : `${views} ${views === 1 ? 'personne a' : 'personnes ont'} consulté votre fiche`
      + (leadCount ? ` et ${leadCount} demande${leadCount === 1 ? '' : 's'} de client${leadCount === 1 ? '' : 's'} sont arrivées` : '');
  const subject = en
    ? `${business || 'Your listing'}: free access ends in ${daysLeft} days`
    : `${business || 'Votre fiche'} : l'accès gratuit se termine dans ${daysLeft} jours`;
  const body = en ? `
    <p>Hello,</p>
    <p>On TrouvePro, ${counts}${city ? ` in ${city}` : ''} this month.</p>
    <p>Free reachability for unclaimed listings ends on <strong>${until}</strong> — in ${daysLeft} days.
       After that, clients can only contact claimed listings.</p>
    <p><strong>Claiming is free.</strong> Staying visible afterwards is $5.49/month for the first
       3 months, then $10.66/month + taxes, cancel anytime.</p>
    <p style="margin:26px 0"><a href="${claim}" style="background:#0f7c7b;color:#fff;text-decoration:none;
       padding:13px 22px;border-radius:10px;font-weight:600;display:inline-block">Claim my listing</a></p>`
    : `
    <p>Bonjour,</p>
    <p>Sur TrouvePro, ${counts}${city ? ` à ${city}` : ''} ce mois-ci.</p>
    <p>L'accès gratuit aux fiches non réclamées se termine le <strong>${until}</strong> — dans
       ${daysLeft} jours. Ensuite, les clients ne peuvent contacter que les fiches réclamées.</p>
    <p><strong>Réclamer est gratuit.</strong> Rester visible ensuite : 5,49 $/mois les 3 premiers
       mois, puis 10,66 $/mois + taxes, annulable en tout temps.</p>
    <p style="margin:26px 0"><a href="${claim}" style="background:#0f7c7b;color:#fff;text-decoration:none;
       padding:13px 22px;border-radius:10px;font-weight:600;display:inline-block">Réclamer ma fiche</a></p>`;
  const text = en
    ? `TrouvePro: ${counts}. Free access ends ${until} (${daysLeft}d). Claim free: ${claim}`
    : `TrouvePro : ${counts}. L'accès gratuit finit le ${until} (${daysLeft} j). Réclamez gratuitement : ${claim}`;
  return {
    subject, text,
    html: `<!doctype html><html lang="${en ? 'en' : 'fr'}"><body style="font-family:system-ui,sans-serif;`
      + `font-size:15px;line-height:1.5;color:#0a3538;max-width:560px">${body}${leads.footer(en, token)}</body></html>`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const withSms = args.includes('--sms');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : 25;
  const minIdx = args.indexOf('--min-activity');
  const minActivity = minIdx >= 0 ? Number(args[minIdx + 1]) : 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('--limit must be 1..200');
  if (!Number.isInteger(minActivity) || minActivity < 1) throw new Error('--min-activity must be >= 1');

  const win = openAccess.status();
  if (!win.active) return console.log('open-access window is closed — nothing to remind about');
  if (!POSTAL) throw new Error('OUTREACH_POSTAL_ADDRESS is required: CASL needs a postal address in every message');
  if (!dry && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is unset — emails would only print');

  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86400000).toISOString();
  const { data: contacts, error } = await supabase.from('outreach_sendable')
    .select('id, email, phone, business_name, lang, rbq_licence, city, unsubscribe_token, proof_sent_at')
    .not('rbq_licence', 'is', null)
    .or(`proof_sent_at.is.null,proof_sent_at.lt.${cutoff}`)
    .order('id').limit(limit * 6);
  if (error) throw error;

  let sent = 0, skipped = 0;
  for (const c of contacts || []) {
    if (sent >= limit) break;
    const { data: p } = await supabase.from('providers')
      .select('user_id, display_name, city, claimed').eq('rbq_licence', c.rbq_licence).maybeSingle();
    if (!p || p.claimed || !openAccess.covers(p.city)) { skipped++; continue; }

    const views = await leads.viewsSince(p.user_id, 30).catch(() => 0);
    const leadCount = await leads.leadsSince(p.user_id, 30).catch(() => 0);
    if (views + leadCount < minActivity) { skipped++; continue; }

    const m = message({
      business: c.business_name || p.display_name, city: p.city || c.city,
      views, leadCount, licence: c.rbq_licence, lang: c.lang === 'en' ? 'en' : 'fr',
      until: win.until, daysLeft: win.daysLeft, token: c.unsubscribe_token,
    });
    if (dry) { console.log(`${c.email} — ${views} views, ${leadCount} leads\n${m.subject}\n\n${m.html}\n`); sent++; continue; }

    try {
      await sendEmail(c.email, m.subject, m.html, { replyTo: REPLY_TO, bcc: BCC });
      if (withSms && c.phone) await sms.send(c.phone, m.text).catch(e => console.error('sms', c.phone, e.message));
      const upd = await supabase.from('outreach_contacts')
        .update({ proof_sent_at: new Date().toISOString() }).eq('id', c.id);
      if (upd.error) console.error('mark reminded', c.email, upd.error.message);
      sent++;
    } catch (e) { console.error('send failed', c.email, e.message); }
    await new Promise(r => setTimeout(r, GAP_MS));
  }
  console.log(`open-access reminder: ${sent} ${dry ? 'would be sent' : 'sent'}, ${skipped} skipped`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { message };
