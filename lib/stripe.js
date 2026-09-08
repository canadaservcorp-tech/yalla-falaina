// Stripe REST helper — deliberately the same shape as lib/paypal.js: no SDK
// dependency, API key auth, a thin call-and-parse wrapper. This repo already
// runs PayPal this way rather than pulling in its SDK, so Stripe follows the
// same house style instead of introducing a second, inconsistent pattern.
//
// One real difference from PayPal: Stripe's API takes
// application/x-www-form-urlencoded bodies (bracket notation for nested
// params, e.g. `line_items[0][price]=x`), not JSON — toForm() below handles
// that. Responses are always JSON either way.
const crypto = require('crypto');

const KEY = process.env.STRIPE_SECRET_KEY || '';
const BASE = 'https://api.stripe.com/v1';

const configured = () => Boolean(KEY);

function toForm(obj, prefix = '') {
  const parts = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const ik = `${key}[${i}]`;
        if (item && typeof item === 'object') { const f = toForm(item, ik); if (f) parts.push(f); }
        else parts.push(`${encodeURIComponent(ik)}=${encodeURIComponent(item)}`);
      });
    } else if (typeof v === 'object') {
      const f = toForm(v, key);
      if (f) parts.push(f);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

async function stripeApi(method, path, params) {
  const isGet = method === 'GET';
  const qs = isGet && params ? '?' + toForm(params) : '';
  const r = await fetch(BASE + path + qs, {
    method,
    headers: {
      Authorization: 'Bearer ' + KEY,
      ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    ...(!isGet && params ? { body: toForm(params) } : {}),
  });
  const text = await r.text();
  const j = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error((j.error && j.error.message) || `Stripe ${r.status}`);
  return j;
}

// Verifies a Stripe webhook's Stripe-Signature header locally (HMAC-SHA256
// over "timestamp.rawBody"), the documented algorithm — no live API call the
// way PayPal's verify-webhook-signature endpoint needs, since Stripe signs
// with a shared secret rather than a certificate. rawBody MUST be the exact
// bytes Stripe sent (a re-serialized JSON.stringify would not match), which
// is why the route below reads it with express.raw(), same as the PayPal
// webhook does.
function verifyWebhookSignature(rawBody, sigHeader, secret, toleranceSeconds = 300) {
  if (!rawBody || !sigHeader || !secret) return false;
  const parts = {};
  for (const kv of String(sigHeader).split(',')) {
    const i = kv.indexOf('=');
    if (i === -1) continue;
    parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  // Blunts replay of an old, legitimately-signed payload — a stale timestamp
  // fails even with a correct signature.
  return Math.abs(Date.now() / 1000 - Number(timestamp)) <= toleranceSeconds;
}

module.exports = { configured, stripeApi, verifyWebhookSignature, BASE };
