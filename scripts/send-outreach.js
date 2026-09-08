// TrouvePro — send the presentation campaign to prospected providers.
//
// Usage: node scripts/send-outreach.js --dry-run          # print the first message, send nothing
//        node scripts/send-outreach.js --limit 25         # send to the 25 oldest untouched contacts
//        node scripts/send-outreach.js --limit 400 --resend  # include contacts already emailed once
//        node scripts/send-outreach.js --source salon_invite --limit 25   # one prospect batch only
//
// Two audiences, two messages: RBQ licence holders already have a seeded listing to claim, while
// prospects collected elsewhere have nothing yet and are invited to be the first in their trade.
//
// CASL: every message carries the sender's legal name and postal address, a working reply address
// and a one-click unsubscribe tied to the contact's own token. Implied consent here is business
// contact information the business itself published, and each message says where we found it.
// Contacts that unsubscribed, bounced or already claimed their listing are excluded by the
// outreach_sendable view, so re-running the script never re-mails them.
require('dotenv').config();
const supabase = require('../db');
const { sendEmail } = require('../lib/email');

const SITE = (process.env.PUBLIC_URL || 'https://www.mytrouvepro.net').replace(/\/$/, '');
const POSTAL = process.env.OUTREACH_POSTAL_ADDRESS;      // required: CASL identification
const REPLY_TO = process.env.OUTREACH_REPLY_TO || 'canada.servcorp@gmail.com';
const BCC = process.env.OUTREACH_BCC || null;             // keep a copy of every campaign message
const INSTAGRAM = 'https://www.instagram.com/mytrouvepro';
const LEGAL_NAME = 'Performance Cristal Technologies Avancées S.A. (NEQ 2280629637)';
const GAP_MS = 1200;                                     // stay well under Resend's rate limit

// Trades we prospect outside the RBQ register, French label -> English label for the EN copy.
const TRADES = {
  'coiffure': 'hairdressing',
  'barbier': 'barbering',
  'massothérapie': 'massage therapy',
  'esthétique': 'esthetics',
  'soins infirmiers': 'nursing care',
  'mécanique automobile': 'auto mechanics'
};

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Deliberately short: four lines, one button. The legal minimum (why we have their address, who we
// are, how to stop) sits in the small print, and the subscription price is stated once — meeting it
// first at the paywall would feel like bait.
function message(contact) {
  const en = contact.lang === 'en';
  const seeded = contact.source === 'rbq_register';       // has a listing waiting to be claimed
  const name = esc(contact.business_name || (en ? 'your business' : 'votre entreprise'));
  const trade = contact.trade || '';
  const tradeLabel = esc(en ? (TRADES[trade] || 'your trade') : (trade || 'votre métier'));
  const source = seeded ? 'rbq_email' : `${contact.source || 'prospect'}_email`;
  // A seeded contact goes to their own listing page (name, city, licence, one claim button);
  // without a licence there is no listing URL to send them to, so the token link still applies.
  const target = seeded
    ? (contact.rbq_licence
      ? `${SITE}/fiche/${encodeURIComponent(contact.rbq_licence)}?t=${contact.unsubscribe_token}&utm_source=${source}`
      : `${SITE}/?claim=${contact.unsubscribe_token}&utm_source=${source}`)
    : `${SITE}/?join=provider&utm_source=${source}`;
  const stop = `${SITE}/api/outreach/unsubscribe?token=${contact.unsubscribe_token}`;
  const subject = seeded
    ? (en ? `${contact.business_name || 'Your business'} is already on TrouvePro`
      : `${contact.business_name || 'Votre entreprise'} est déjà sur TrouvePro`)
    : (en ? `Clients near you are looking for ${TRADES[trade] || 'your trade'}`
      : `Des clients près de vous cherchent ${trade ? 'des services de ' + trade : 'votre métier'}`);
  const button = `<p style="margin:26px 0"><a href="${target}" style="background:#0f7c7b;color:#fff;`
    + `text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:600;display:inline-block">`
    + (seeded ? (en ? 'See my listing' : 'Voir ma fiche') : (en ? 'Create my listing' : 'Créer ma fiche'))
    + `</a></p>`;

  const seededBody = en ? `
    <p>Hello,</p>
    <p><strong>${name}</strong> already has a listing on TrouvePro — we built it from the public RBQ
       licence register. It is live, clients can see it… and <strong>nobody is managing it</strong>.</p>
    <p>TrouvePro ranks providers by <strong>real proximity</strong>: when someone a few streets away
       searches for your trade, they see the closest pros first. Not ads — neighbours.</p>
    <p>Claiming your listing is free and takes two minutes. Staying visible afterwards is
       $5.49/month for the first 3 months, then $10.66/month, cancel anytime.</p>
    ${button}`
    : `
    <p>Bonjour,</p>
    <p><strong>${name}</strong> a déjà une fiche sur TrouvePro — créée à partir du registre public des
       licences RBQ. Elle est en ligne, les clients la voient… et
       <strong>personne ne la gère</strong>.</p>
    <p>TrouvePro classe les prestataires par <strong>proximité réelle</strong> : quand quelqu'un à
       quelques rues cherche votre métier, il voit d'abord les pros les plus proches. Pas des
       publicités — des voisins.</p>
    <p>Réclamer votre fiche est gratuit et prend deux minutes. Rester visible ensuite :
       5,49 $/mois les 3 premiers mois, puis 10,66 $/mois, annulable en tout temps.</p>
    ${button}`;

  // Nothing to claim here, so the hook is scarcity: the searches exist, the listings do not yet.
  const inviteBody = en ? `
    <p>Hello,</p>
    <p>People in Laval and Montréal search TrouvePro for <strong>${tradeLabel}</strong> near them —
       and almost nobody in your area is listed yet.</p>
    <p>TrouvePro ranks providers by <strong>real proximity</strong>: the client sees the closest pros
       first, in French or English. No ads, no commission on your jobs — just neighbours looking for
       what you do.</p>
    <p>Creating your listing is free and takes two minutes. Staying visible afterwards is
       $5.49/month for the first 3 months, then $10.66/month, cancel anytime.</p>
    ${button}`
    : `
    <p>Bonjour,</p>
    <p>À Laval et à Montréal, des clients cherchent <strong>des services de ${tradeLabel}</strong>
       près d'eux sur TrouvePro — et presque personne de votre secteur n'y est encore inscrit.</p>
    <p>TrouvePro classe les prestataires par <strong>proximité réelle</strong> : le client voit
       d'abord les pros les plus proches, en français comme en anglais. Pas de publicité, aucune
       commission sur vos contrats — juste des voisins qui cherchent ce que vous faites.</p>
    <p>Créer votre fiche est gratuit et prend deux minutes. Rester visible ensuite :
       5,49 $/mois les 3 premiers mois, puis 10,66 $/mois, annulable en tout temps.</p>
    ${button}`;

  // Secondary links: the subscription screen (so the price is verifiable before signing up) and the
  // Instagram page, which is where the campaign's social proof lives.
  const subUrl = `${SITE}/?subscribe=1&utm_source=${source}`;
  const links = `<p style="font-size:13px;color:#555">`
    + (en
      ? `<a href="${subUrl}" style="color:#0f7c7b">See the subscription</a> &nbsp;·&nbsp; `
        + `<a href="${INSTAGRAM}" style="color:#0f7c7b">Follow TrouvePro on Instagram</a>`
      : `<a href="${subUrl}" style="color:#0f7c7b">Voir l'abonnement</a> &nbsp;·&nbsp; `
        + `<a href="${INSTAGRAM}" style="color:#0f7c7b">Suivez TrouvePro sur Instagram</a>`)
    + `</p>`;

  const body = (seeded ? seededBody : inviteBody) + links;
  // Where the address came from is what establishes implied consent, so it has to be accurate.
  const found = seeded
    ? (en ? 'your business contact information is published in the RBQ licence register'
      : 'les coordonnées de votre entreprise sont publiées au registre des licences RBQ')
    : (en ? 'your business publishes this address publicly for client enquiries'
      : 'votre entreprise publie publiquement cette adresse pour ses clients');

  const footer = en ? `
    <hr style="border:none;border-top:1px solid #ddd;margin:22px 0">
    <p style="font-size:12px;color:#666">
      Sent by ${LEGAL_NAME}, ${esc(POSTAL)}.<br>
      You received this because ${found}. Reply to ${esc(REPLY_TO)} or
      <a href="${stop}">unsubscribe</a> — one click, no account needed.
    </p>`
    : `
    <hr style="border:none;border-top:1px solid #ddd;margin:22px 0">
    <p style="font-size:12px;color:#666">
      Envoyé par ${LEGAL_NAME}, ${esc(POSTAL)}.<br>
      Vous recevez ce courriel parce que ${found}. Répondez à ${esc(REPLY_TO)} ou
      <a href="${stop}">désabonnez-vous</a> — un seul clic, aucun compte requis.
    </p>`;

  const html = `<!doctype html><html lang="${en ? 'en' : 'fr'}"><body style="font-family:system-ui,sans-serif;`
    + `font-size:15px;line-height:1.5;color:#0a3538;max-width:560px">${body}${footer}</body></html>`;
  return { subject, html };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const resend = args.includes('--resend');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : 50;
  const srcIdx = args.indexOf('--source');
  const source = srcIdx >= 0 ? args[srcIdx + 1] : null;
  if (srcIdx >= 0 && !/^[a-z0-9_]+$/.test(source || '')) throw new Error('--source must be a list source name');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('--limit must be 1..1000');
  if (!POSTAL) throw new Error('OUTREACH_POSTAL_ADDRESS is required: CASL needs a postal address in every message');
  if (!dry && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is unset — emails would only print');

  let q = supabase.from('outreach_sendable')
    .select('id, email, business_name, lang, trade, source, unsubscribe_token, send_count')
    .order('id').limit(limit);
  if (!resend) q = q.eq('send_count', 0);
  if (source) q = q.eq('source', source);
  const { data: contacts, error } = await q;
  if (error) throw error;
  if (!contacts || !contacts.length) return console.log('nothing to send');

  if (dry) {
    const m = message(contacts[0]);
    console.log(`would send to ${contacts.length} contact(s); first one: ${contacts[0].email}\n`);
    console.log(m.subject + '\n\n' + m.html);
    return;
  }

  let sent = 0, failed = 0;
  for (const c of contacts) {
    const m = message(c);
    try {
      await sendEmail(c.email, m.subject, m.html, { replyTo: REPLY_TO, bcc: BCC });
      const upd = await supabase.from('outreach_contacts')
        .update({ last_sent_at: new Date().toISOString(), send_count: (c.send_count || 0) + 1 })
        .eq('id', c.id);
      if (upd.error) console.error('outreach mark sent', c.email, upd.error.message);
      sent++;
    } catch (e) { failed++; console.error('send failed', c.email, e.message); }
    await new Promise(r => setTimeout(r, GAP_MS));
  }
  console.log(`outreach: ${sent} sent, ${failed} failed, ${contacts.length} selected`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { message };
