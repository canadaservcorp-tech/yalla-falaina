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
  booking_requested: {
    fr: { subject: 'Nouvelle demande de réservation', line: 'Un client demande un rendez-vous. Acceptez ou refusez dans vos réservations.' },
    en: { subject: 'New booking request', line: 'A client is requesting an appointment. Accept or decline it in your bookings.' },
  },
  booking_accepted: {
    fr: { subject: 'Réservation acceptée', line: 'Le prestataire a accepté votre rendez-vous. Le dépôt sera à autoriser peu avant la date.' },
    en: { subject: 'Booking accepted', line: 'The provider accepted your appointment. The deposit is authorized shortly before the date.' },
  },
  booking_declined: {
    fr: { subject: 'Réservation refusée', line: 'Le prestataire a refusé ce créneau. Aucun montant n’a été retenu.' },
    en: { subject: 'Booking declined', line: 'The provider declined this slot. Nothing was held.' },
  },
  booking_auth_due: {
    fr: { subject: 'Autorisez le dépôt de votre réservation', line: 'Votre rendez-vous approche : autorisez le dépôt pour confirmer la réservation.' },
    en: { subject: 'Authorize your booking deposit', line: 'Your appointment is coming up: authorize the deposit to confirm the booking.' },
  },
  booking_confirmed: {
    fr: { subject: 'Réservation confirmée', line: 'Le dépôt est autorisé (non prélevé). Le rendez-vous est confirmé.' },
    en: { subject: 'Booking confirmed', line: 'The deposit is authorized (not charged). The appointment is confirmed.' },
  },
  booking_cancelled: {
    fr: { subject: 'Réservation annulée', line: 'Une réservation a été annulée. Consultez vos réservations pour le détail du dépôt.' },
    en: { subject: 'Booking cancelled', line: 'A booking was cancelled. See your bookings for what happened to the deposit.' },
  },
  booking_completed: {
    fr: { subject: 'Réservation terminée', line: 'Le prestataire a marqué le rendez-vous comme terminé et le dépôt a été prélevé.' },
    en: { subject: 'Booking completed', line: 'The provider marked the appointment as done and the deposit was captured.' },
  },
  booking_expired: {
    fr: { subject: 'Autorisation de dépôt expirée', line: 'L’autorisation du dépôt a expiré avant la fin du rendez-vous. Aucun montant n’a été prélevé.' },
    en: { subject: 'Deposit authorization expired', line: 'The deposit authorization lapsed before the appointment was completed. Nothing was charged.' },
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
