const FROM = process.env.MAIL_FROM || 'Yalla Falaina <onboarding@resend.dev>';
async function sendEmail(to, subject, html, { replyTo, bcc } = {}) {
  const KEY = process.env.RESEND_API_KEY;                 // read late: tests clear it to stay offline
  if (!KEY) { console.log(`[email:dev] to=${to} | ${subject}\n${html}\n`); return { dev: true }; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to, subject, html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(bcc ? { bcc } : {}),
    }),
  });
  if (!r.ok) throw new Error('email send failed: ' + (await r.text()));
  return r.json();
}
module.exports = { sendEmail };
