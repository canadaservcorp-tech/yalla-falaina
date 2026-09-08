// Leads left on an unclaimed listing during the Founding Month window, and the notice that
// tells the owner one is waiting.
//
// The notice fires because a seeker just acted, never on a schedule, and it never hands the
// seeker's request to someone who has not claimed the listing: claiming is free, so the only
// thing standing between the contractor and the lead is two minutes of his time.
const supabase = require('../db');
const { sendEmail } = require('./email');
const sms = require('./sms');

const SITE = (process.env.PUBLIC_URL || 'https://www.mytrouvepro.net').replace(/\/$/, '');
const REPLY_TO = process.env.OUTREACH_REPLY_TO || 'canada.servcorp@gmail.com';
const LEGAL_NAME = 'Performance Cristal Technologies Avancées S.A. (NEQ 2280629637)';
// One notice per listing per six hours; above that the leads pile up and the day-27 reminder
// carries the total instead. Nobody gets buzzed twenty times.
const QUIET_HOURS = 6;

async function countSince(table, providerId, sinceMs) {
  const { count, error } = await supabase.from(table)
    .select('id', { count: 'exact', head: true })
    .eq('provider_user_id', providerId)
    .gte('created_at', new Date(Date.now() - sinceMs).toISOString());
  if (error) throw error;
  return Number(count) || 0;
}

const leadsSince = (providerId, days = 30) => countSince('listing_leads', providerId, days * 86400000);
const viewsSince = (providerId, days = 30) => countSince('listing_views', providerId, days * 86400000);

// Where to reach a contractor who has no account: the address the RBQ register publishes,
// which is the same list the invitation used, minus anyone who unsubscribed.
async function contactFor(licence) {
  const { data, error } = await supabase.from('outreach_sendable')
    .select('email, phone, lang, business_name, unsubscribe_token').eq('rbq_licence', licence).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function view(providerId, licence) {
  if (!Number.isSafeInteger(providerId) || providerId <= 0) return;
  const { error } = await supabase.from('listing_views')
    .insert({ provider_user_id: providerId, rbq_licence: licence || null });
  if (error) console.error('listing view', error.message);
}

// A notice carries a claim invitation, so it is a commercial message: it identifies the sender,
// says where the address came from and unsubscribes in one click, like every other campaign mail.
function footer(en, token) {
  const stop = `${SITE}/api/outreach/unsubscribe?token=${token}`;
  const found = en
    ? 'your business contact information is published in the RBQ licence register'
    : 'les coordonnées de votre entreprise sont publiées au registre des licences RBQ';
  return `<hr style="border:none;border-top:1px solid #ddd;margin:22px 0">
    <p style="font-size:12px;color:#666">${en ? 'Sent by' : 'Envoyé par'} ${LEGAL_NAME}, ${process.env.OUTREACH_POSTAL_ADDRESS}.<br>
    ${en ? 'You received this because' : 'Vous recevez ce courriel parce que'} ${found}. ${en ? 'Reply to' : 'Répondez à'} ${REPLY_TO} ${en ? 'or' : 'ou'}
    <a href="${stop}">${en ? 'unsubscribe' : 'désabonnez-vous'}</a>.</p>`;
}

function notice({ business, city, trade, count, lang, licence, daysLeft, until, token }) {
  const en = lang === 'en';
  const claim = `${SITE}/fiche/${encodeURIComponent(licence)}?utm_source=lead_notice`;
  const nth = count > 1 ? (en ? ` It is your ${count}th request this month.` : ` C'est votre ${count}e demande ce mois-ci.`) : '';
  const subject = en
    ? `A client in ${city || 'your area'} is looking for you on TrouvePro`
    : `Un client de ${city || 'votre secteur'} vous cherche sur TrouvePro`;
  const body = en ? `
    <p>Hello,</p>
    <p>A client${city ? ' in ' + city : ''} just asked for ${trade || 'your trade'} on TrouvePro and
       chose <strong>${business || 'your business'}</strong>.${nth}</p>
    <p>The request is waiting on your listing. <strong>Claiming your listing is free</strong> and
       takes two minutes — you then read the request and call the client back yourself.</p>
    <p>Free reachability for unclaimed listings ends on <strong>${until}</strong>
       (${daysLeft} days left). After that, only claimed listings can be contacted.</p>
    <p style="margin:26px 0"><a href="${claim}" style="background:#0f7c7b;color:#fff;text-decoration:none;
       padding:13px 22px;border-radius:10px;font-weight:600;display:inline-block">Read the request</a></p>`
    : `
    <p>Bonjour,</p>
    <p>Un client${city ? ' de ' + city : ''} vient de chercher ${trade || 'votre métier'} sur TrouvePro
       et a choisi <strong>${business || 'votre entreprise'}</strong>.${nth}</p>
    <p>La demande est en attente sur votre fiche. <strong>Réclamer votre fiche est gratuit</strong> et
       prend deux minutes — vous lisez ensuite la demande et rappelez le client vous-même.</p>
    <p>L'accès gratuit pour les fiches non réclamées se termine le <strong>${until}</strong>
       (${daysLeft} jours restants). Ensuite, seules les fiches réclamées peuvent être contactées.</p>
    <p style="margin:26px 0"><a href="${claim}" style="background:#0f7c7b;color:#fff;text-decoration:none;
       padding:13px 22px;border-radius:10px;font-weight:600;display:inline-block">Lire la demande</a></p>`;
  const text = en
    ? `TrouvePro: a client${city ? ' in ' + city : ''} is looking for ${business || 'you'}.${nth} Claim your free listing to read it: ${claim}`
    : `TrouvePro : un client${city ? ' de ' + city : ''} cherche ${business || 'vous'}.${nth} Réclamez votre fiche gratuite pour la lire : ${claim}`;
  return { subject, html: `<!doctype html><html lang="${en ? 'en' : 'fr'}"><body style="font-family:system-ui,sans-serif;`
    + `font-size:15px;line-height:1.5;color:#0a3538;max-width:560px">${body}${footer(en, token)}</body></html>`, text };
}

// Was this listing already told within the quiet window? Then stay silent: the lead is stored
// either way and the reminder will carry the count.
async function recentlyNotified(providerId) {
  const { data, error } = await supabase.from('listing_leads')
    .select('notified_at').eq('provider_user_id', providerId)
    .not('notified_at', 'is', null)
    .order('notified_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || !data.notified_at) return false;
  return Date.now() - new Date(data.notified_at).getTime() < QUIET_HOURS * 3600000;
}

// Returns { lead, notified } — a lead is always stored, a notice is best effort.
async function create({ provider, licence, name, contact, city, message, trade, window }) {
  const quiet = await recentlyNotified(provider.user_id).catch(() => false);
  const { data: lead, error } = await supabase.from('listing_leads').insert({
    provider_user_id: provider.user_id, rbq_licence: licence,
    seeker_name: name, seeker_contact: contact, seeker_city: city || null,
    message: message || null, trade: trade || null,
    notified_at: quiet ? null : new Date().toISOString(),
  }).select('id').maybeSingle();
  if (error) throw error;
  if (quiet) return { lead, notified: false };

  try {
    const who = await contactFor(licence);
    if (!who || !who.email) return { lead, notified: false };
    // No postal address means no compliant message: keep the lead, stay silent.
    if (!process.env.OUTREACH_POSTAL_ADDRESS) return { lead, notified: false };
    const count = await leadsSince(provider.user_id, 30).catch(() => 1);
    const m = notice({
      business: who.business_name || provider.display_name, city, trade, count,
      lang: who.lang === 'en' ? 'en' : 'fr', licence, token: who.unsubscribe_token,
      daysLeft: window.daysLeft, until: window.until,
    });
    await sendEmail(who.email, m.subject, m.html, { replyTo: REPLY_TO, bcc: process.env.OUTREACH_BCC || null });
    if (who.phone) await sms.send(who.phone, m.text);   // no-op until an SMS provider is configured
    return { lead, notified: true };
  } catch (e) {
    console.error('lead notice', e.message);
    return { lead, notified: false };
  }
}

module.exports = { create, view, leadsSince, viewsSince, contactFor, notice, footer, QUIET_HOURS };
