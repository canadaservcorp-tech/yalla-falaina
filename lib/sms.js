// Text messages, when an SMS provider is configured. Without TWILIO_* set this is a no-op, so
// every caller can ask for a text and get one the day the account exists — nothing to rewire.
const SID = () => process.env.TWILIO_ACCOUNT_SID;
const TOKEN = () => process.env.TWILIO_AUTH_TOKEN;
const FROM = () => process.env.TWILIO_FROM;

// Canadian numbers as the RBQ register publishes them: 450 669-3002, (450) 669-3002, 4506693002.
function e164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

async function send(to, text) {
  const sid = SID(), token = TOKEN(), from = FROM();
  const number = e164(to);
  if (!number) return { skipped: 'unusable number' };
  // No provider yet: say so and stay quiet. Logging the number and the message would leave a
  // contractor's phone and a client's words in the platform logs for nothing.
  if (!sid || !token || !from) return { skipped: 'no provider configured' };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: number, From: from, Body: String(text).slice(0, 320) }),
  });
  if (!r.ok) throw new Error('sms send failed: ' + (await r.text()));
  return r.json();
}

module.exports = { send, e164 };
