// Notifications: write an in-app row and, unless the user opted out, email it.
// Never throws into the caller — a message must send even if notifying fails.
const supabase = require('../db');
const { sendEmail } = require('./email');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

const TEMPLATES = {
  new_message: {
    fr: { subject: 'Nouveau message sur TrouvePro', line: 'Vous avez un nouveau message.' },
    en: { subject: 'New message on TrouvePro', line: 'You have a new message.' },
  },
  sub_expiring: {
    fr: { subject: 'Votre abonnement expire bientôt', line: 'Votre abonnement se termine dans 7 jours. Renouvelez pour rester visible.' },
    en: { subject: 'Your subscription expires soon', line: 'Your subscription ends in 7 days. Renew to stay visible.' },
  },
  boost_ending: {
    fr: { subject: 'Votre mise en avant se termine', line: 'Votre promotion (top 5) se termine dans 24 heures.' },
    en: { subject: 'Your boost is ending', line: 'Your top-5 promotion ends in 24 hours.' },
  },
};

// notify(userId, type, { lang }) -> in-app row + email when notify_email !== false
async function notify(userId, type, opts = {}) {
  const tpl = TEMPLATES[type];
  if (!tpl || !Number.isSafeInteger(Number(userId))) return { sent: false };
  try {
    const { data: u } = await supabase.from('users')
      .select('email, notify_email, lang, banned').eq('id', userId).maybeSingle();
    if (!u || u.banned) return { sent: false };
    const lang = (opts.lang || u.lang) === 'en' ? 'en' : 'fr';
    const t = tpl[lang];

    const { error } = await supabase.from('notifications')
      .insert({ user_id: Number(userId), type, title: t.subject, body: t.line });
    // the unique index refuses a second reminder of the same kind on the same day
    if (error) { console.error('notify insert', error.message); return { sent: false }; }

    if (u.notify_email !== false && u.email) {
      await sendEmail(u.email, t.subject,
        `<p>${t.line}</p><p><a href="${PUBLIC_URL}">TrouvePro</a></p>`);
    }
    return { sent: true };
  } catch (e) { console.error('notify', e.message); return { sent: false }; }
}

module.exports = { notify, TEMPLATES };
