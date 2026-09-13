// Public "contact us" form. Deliberately writes to the database FIRST and only
// then tries to email: Resend delivery is a third-party call that can fail (and
// currently does, while the sending domain is unverified), and a visitor's
// message is not something to lose to a 500 from someone else's API. The row is
// the record of truth; the email is a convenience notification on top of it, so
// a send failure is logged and the visitor still gets a success.
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const { sendEmail } = require('../lib/email');
const router = express.Router();

// Where notifications go. Env-overridable so this isn't a code change when the
// destination inbox changes.
const TO = process.env.CONTACT_EMAIL || 'canada.servcorp@gmail.com';

const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

router.post('/', sec.limits.report, async (req, res) => {
  try {
    const name = sec.clean(req.body.name, 120);
    const email = sec.normalizeEmail(req.body.email);
    const message = sec.clean(req.body.message, 2000);
    if (!name || !message)
      return res.status(400).json({ error: 'name and message are required', code: 'ERR_BAD_INPUT' });
    if (!sec.isEmail(email))
      return res.status(400).json({ error: 'A valid email is required', code: 'ERR_BAD_EMAIL' });

    const { error } = await supabase.from('contact_messages').insert({ name, email, message });
    if (error) throw error;

    // reply_to is the visitor's address, so hitting Reply in the destination
    // inbox answers them directly rather than the no-reply sender.
    try {
      await sendEmail(TO, `Yalla Nsafer — contact form: ${name}`,
        `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>` +
        `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
        { replyTo: email });
    } catch (e) {
      console.error('contact email send failed (message is saved)', e);
    }

    res.json({ success: true, message: "Thanks — we've got your message and will reply by email." });
  } catch (e) {
    console.error('contact submit', e);
    res.status(500).json({ error: 'Could not send right now', code: 'ERR_SERVER' });
  }
});

module.exports = router;
