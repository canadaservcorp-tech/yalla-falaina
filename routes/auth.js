const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const sec = require('../lib/security');
const totp = require('../lib/totp');
const { authenticate } = require('../lib/auth-mw');
const router = express.Router();
const { JWT_SECRET } = process.env;
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const BCRYPT_ROUNDS = 12;
const TERMS_VERSION = '2026-09-08';
const LANGUAGES = ['ar-LB', 'ar-SY', 'ar-EG', 'ar', 'fr', 'en'];
// Account-level brute-force lockout (schema.sql's record_login_result()) —
// keyed on the account, not the IP, specifically to close the gap
// sec.limits.credentials (IP+email) leaves open: a botnet spraying wrong
// guesses at ONE account from many different addresses gets a fresh rate-limit
// bucket per IP, so nothing there ever stops it. This does, regardless of
// where the attempts come from.
const MAX_FAILED_LOGINS = 8;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

// compared against when no account matches, so timing doesn't reveal existence
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

const sameToken = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Best-effort: a hiccup here must never be why a correct login fails, or why
// a wrong one silently escapes being counted — either way this only logs.
async function recordLoginResult(userId, success) {
  try {
    const { error } = await supabase.rpc('record_login_result',
      { p_user_id: userId, p_success: success, p_max_attempts: MAX_FAILED_LOGINS, p_lock_ms: LOCK_MS });
    if (error) console.error('record_login_result', error.message);
  } catch (e) { console.error('record_login_result', e.message); }
}

router.post('/register', sec.limits.register, sec.limits.credentials, async (req, res) => {
  try {
    const email = sec.normalizeEmail(req.body.email);
    const { password } = req.body;
    const name = sec.clean(req.body.name, 80);
    const phone = sec.clean(req.body.phone, 30) || '';
    const signup_source = (sec.clean(req.body.source, 40) || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '') || null;
    if (!sec.isEmail(email) || !name) return res.status(400).json({ error: 'Missing or invalid fields', code: 'ERR_BAD_INPUT' });
    const pwProblem = sec.passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem, code: 'ERR_WEAK_PASSWORD' });
    if (req.body.acceptTerms !== true) return res.status(400).json({ error: 'You must accept the Terms of Use', code: 'ERR_TERMS_REQUIRED' });
    // Hard 18+ gate (Sections 4.3/10) — the platform does not serve minors.
    if (req.body.confirmAge !== true) return res.status(400).json({ error: 'You must be 18 or older to use Yalla Nsafer', code: 'ERR_AGE_GATE' });

    const { data: banned } = await supabase.from('banned_emails').select('email').eq('email', email).maybeSingle();
    if (banned) return res.status(403).json({ error: 'This email is blocked', code: 'ERR_EMAIL_BLOCKED' });
    const { data: exists } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    // don't confirm which addresses are registered — same reply either way
    if (exists) {
      try {
        await sendEmail(email, 'Sign in to Yalla Nsafer',
          '<p>An account already exists with this email. Sign in, or reset your password.</p>');
      } catch (e) { console.error('register:exists email', e.message); }
      return res.json({ success: true, message: 'Registered — check your email to verify.' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verify_token = crypto.randomBytes(32).toString('hex');
    const { data: user, error } = await supabase.from('users')
      .insert({
        email, password_hash, name, phone, role: 'seeker', verify_token, signup_source,
        terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION,
      })
      .select('id, email, name, role').single();
    if (error) throw error;

    // Section 10 intake fields; preferred country is a weighting signal for
    // matching, never a filter. profile_id is the user id — 1:1 by design.
    const { error: pErr } = await supabase.from('profiles').insert({
      id: user.id,
      full_name: name,
      age_confirmed_18_plus: true,
      phone: phone || null,
      preferred_language: LANGUAGES.includes(req.body.preferredLanguage) ? req.body.preferredLanguage : null,
      preferred_country: sec.clean(req.body.preferredCountry, 60) || null,
      sector: sec.clean(req.body.sector, 80) || null,
      role_type: sec.clean(req.body.roleType, 80) || null,
    });
    if (pErr) console.error('profile create', pErr.message);   // account stands; profile can be completed later

    const link = `${PUBLIC_URL}/api/auth/verify?token=${verify_token}&id=${user.id}`;
    // The account stands even when the email can't be sent (Resend rejects
    // some recipients, or the key isn't configured yet) — a mail failure must
    // not 500 a persisted registration; the client gets emailSent:false so it
    // can say "we couldn't send the email yet" instead of a fake success.
    let emailSent = true;
    try {
      await sendEmail(email, 'Confirm your email — Yalla Nsafer',
        `<p>Welcome to Yalla Nsafer. Confirm your email:</p><p><a href="${link}">${link}</a></p>`);
    } catch (e) { emailSent = false; console.error('register:verify email', e.message); }

    // Operator notification: every new signup pings NOTIFY_EMAIL (falling
    // back to the contact inbox). Best-effort — a notification failure must
    // never fail or delay the seeker's own registration reply.
    const notifyTo = sec.normalizeEmail(process.env.NOTIFY_EMAIL || '') || sec.normalizeEmail(process.env.CONTACT_EMAIL || '');
    if (notifyTo) {
      try {
        await sendEmail(notifyTo, 'New signup — Yalla Nsafer',
          '<p>A new seeker registered:</p><ul>' +
          `<li>Name: ${escapeHtml(name)}</li><li>Email: ${escapeHtml(email)}</li>` +
          (signup_source ? `<li>Source: ${escapeHtml(signup_source)}</li>` : '') +
          `<li>User ID: ${user.id}</li><li>Verification email sent: ${emailSent}</li></ul>`);
      } catch (e) { console.error('register:notify email', e.message); }
    }
    res.json({ success: true, message: 'Registered — check your email to verify.', userId: user.id, emailSent });
  } catch (e) { console.error('register', e); res.status(500).json({ error: 'Registration failed', code: 'ERR_SERVER' }); }
});

router.get('/verify', sec.limits.verify, async (req, res) => {
  const { token, id } = req.query;
  if (!sec.isId(id) || typeof token !== 'string') return res.status(400).send('Invalid or expired link');
  const { data: u } = await supabase.from('users').select('id, verify_token').eq('id', Number(id)).maybeSingle();
  if (!u || !u.verify_token || !sameToken(u.verify_token, token)) return res.status(400).send('Invalid or expired link');
  await supabase.from('users').update({ email_verified: true, verify_token: null }).eq('id', u.id);
  sec.dropUserFromCache(u.id);
  res.redirect(`${PUBLIC_URL}/?verified=1`);
});

// Covers the two real gaps register's resilience fix left open: the domain
// verification issue that makes Resend reject a send in the first place needs
// a dashboard/DNS fix, not code, but a seeker whose email genuinely never
// arrived (that failure, a stale link, or the message landing in spam) had no
// way back in except re-registering into an email-already-exists dead end.
// Same anti-enumeration shape as /register's exists-check: one generic
// response whatever the account's real state, so this endpoint can't be used
// to test which addresses are registered — only the email content sent
// behind the scenes differs, and every failure path (bad input, no such user,
// a DB error, a send failure) still resolves to that same 200.
router.post('/resend-verification', sec.limits.credentials, async (req, res) => {
  const GENERIC = { success: true, message: 'If that account needs verifying, we just sent a new link.' };
  try {
    const email = sec.normalizeEmail(req.body.email);
    if (!sec.isEmail(email)) return res.json(GENERIC);

    const { data: user } = await supabase.from('users')
      .select('id, email_verified, verify_token').eq('email', email).maybeSingle();
    if (!user) return res.json(GENERIC);

    // Verified accounts get no mail at all — otherwise this endpoint is an
    // unauthenticated "send an email to any registered address" vector.
    if (user.email_verified) return res.json(GENERIC);

    // fresh token: an old leaked/expired link should stop working once a new
    // one is issued. Issue compare-and-swap on the current token so two
    // overlapping resends can't both mint links whose delivery order then
    // inverts against the stored token — a lost CAS means another resend is
    // already in flight, and its email is the one that should win.
    const verify_token = crypto.randomBytes(32).toString('hex');
    let upd = supabase.from('users').update({ verify_token }).eq('id', user.id);
    upd = user.verify_token == null ? upd.is('verify_token', null) : upd.eq('verify_token', user.verify_token);
    const { data: rotated, error } = await upd.select('id');
    if (error) throw error;
    if (rotated && rotated.length === 0) return res.json(GENERIC); // another issuance already in flight

    const link = `${PUBLIC_URL}/api/auth/verify?token=${verify_token}&id=${user.id}`;
    try {
      await sendEmail(email, 'Confirm your email — Yalla Nsafer',
        `<p>Here's your new confirmation link:</p><p><a href="${link}">${link}</a></p>`);
    } catch (e) {
      console.error('resend:verify email', e.message);
      // Nothing new was sent — restore the previous token so the earlier
      // link keeps working instead of leaving the account with a dead end.
      await supabase.from('users').update({ verify_token: user.verify_token })
        .eq('id', user.id).eq('verify_token', verify_token);
    }
    res.json(GENERIC);
  } catch (e) { console.error('resend-verification', e); res.json(GENERIC); }
});

router.post('/login', sec.limits.credentials, async (req, res) => {
  try {
    const email = sec.normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!sec.isEmail(email) || typeof password !== 'string' || !password)
      return res.status(401).json({ error: 'Invalid credentials', code: 'ERR_INVALID_CREDENTIALS' });
    const { data: user } = await supabase.from('users')
      .select('id, email, name, role, password_hash, email_verified, banned, totp_secret, totp_enabled, locked_until')
      .eq('email', email).maybeSingle();
    // always run a comparison so a missing account isn't measurably faster
    const hash = user?.password_hash || DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash).catch(() => false);
    const lockedNow = Boolean(user && user.locked_until && new Date(user.locked_until) > new Date());
    // Same code as the malformed-input case above (all four say "Invalid
    // credentials"): the code must not let a client distinguish "wrong
    // password" from "no such account" any more than the text already does —
    // and a distinct "this account is locked" response would tell an
    // attacker (or a curious seeker) that the address has an account at all,
    // exactly the enumeration leak /register and /resend-verification above
    // already go out of their way to avoid.
    if (!user || user.banned || !ok || lockedNow) {
      // Don't re-record against an already-locked account: record_login_result()
      // only extends locked_until when a NEW lock is being set, but there's no
      // reason to even ask it to on every retry of a lock that's already in effect.
      if (user && !lockedNow) await recordLoginResult(user.id, false);
      return res.status(401).json({ error: 'Invalid credentials', code: 'ERR_INVALID_CREDENTIALS' });
    }
    if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email first', code: 'ERR_UNVERIFIED' });

    if (user.totp_enabled) {
      // Distinguishable from here on only because the password already
      // matched — reaching a 2FA challenge at all necessarily confirms that
      // much to whoever is asking, exactly like any other TOTP-protected login.
      const code = typeof req.body.totpToken === 'string' ? req.body.totpToken.trim() : '';
      if (!code) return res.status(401).json({ error: 'Authentication code required', code: 'ERR_TOTP_REQUIRED' });
      if (!totp.verifyTOTP(user.totp_secret, code)) {
        await recordLoginResult(user.id, false);
        return res.status(401).json({ error: 'Invalid authentication code', code: 'ERR_INVALID_TOTP' });
      }
    }

    await recordLoginResult(user.id, true);
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '2d' });
    res.json({ success: true, token, user: { id: user.id, email, name: user.name, role: user.role } });
  } catch (e) { console.error('login', e); res.status(500).json({ error: 'Login failed', code: 'ERR_SERVER' }); }
});

// ---------- two-factor authentication (TOTP, RFC 6238) ----------
// Available to any account, but this is specifically how an admin closes the
// gap a leaked or phished password alone leaves: routes/admin-informal-listings.js
// gates the moderation queue on role === 'admin' and nothing else, so today
// a stolen admin password is a full compromise. Once enabled, a stolen
// password alone is no longer enough to sign in.
router.get('/totp/status', authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('totp_enabled').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(401).json({ error: 'Invalid token', code: 'ERR_INVALID_TOKEN' });
    res.json({ success: true, totpEnabled: Boolean(user.totp_enabled) });
  } catch (e) { console.error('totp status', e); res.status(500).json({ error: 'Could not read two-factor status', code: 'ERR_SERVER' }); }
});

router.post('/totp/setup', authenticate, sec.requireActiveUser, sec.limits.totp, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('id, email, totp_enabled').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(401).json({ error: 'Invalid token', code: 'ERR_INVALID_TOKEN' });
    if (user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is already enabled', code: 'ERR_TOTP_ALREADY_ENABLED' });
    // Stored but NOT enabled yet — /totp/confirm below must prove the
    // account holder's app actually has this secret loaded before it starts
    // being enforced, or a failed/mistyped scan would lock the account out
    // on its very next login with no way back in.
    const secret = totp.generateSecret();
    const { error } = await supabase.from('users').update({ totp_secret: secret }).eq('id', user.id);
    if (error) throw error;
    res.json({ success: true, secret, otpauthUrl: totp.otpauthUrl(secret, user.email) });
  } catch (e) { console.error('totp setup', e); res.status(500).json({ error: 'Could not start two-factor setup', code: 'ERR_SERVER' }); }
});

router.post('/totp/confirm', authenticate, sec.requireActiveUser, sec.limits.totp, async (req, res) => {
  try {
    const code = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    const { data: user } = await supabase.from('users').select('id, totp_secret, totp_enabled').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(401).json({ error: 'Invalid token', code: 'ERR_INVALID_TOKEN' });
    if (user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is already enabled', code: 'ERR_TOTP_ALREADY_ENABLED' });
    if (!user.totp_secret) return res.status(400).json({ error: 'Call /totp/setup first', code: 'ERR_TOTP_NOT_STARTED' });
    if (!totp.verifyTOTP(user.totp_secret, code)) return res.status(401).json({ error: 'Invalid authentication code', code: 'ERR_INVALID_TOTP' });
    const { error } = await supabase.from('users').update({ totp_enabled: true }).eq('id', user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error('totp confirm', e); res.status(500).json({ error: 'Could not confirm two-factor setup', code: 'ERR_SERVER' }); }
});

router.post('/totp/disable', authenticate, sec.requireActiveUser, sec.limits.totp, async (req, res) => {
  try {
    const { password, token: code } = req.body;
    const { data: user } = await supabase.from('users')
      .select('id, password_hash, totp_secret, totp_enabled').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(401).json({ error: 'Invalid token', code: 'ERR_INVALID_TOKEN' });
    if (!user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled', code: 'ERR_TOTP_NOT_ENABLED' });
    // Turning 2FA OFF requires proving BOTH factors again, not just a valid
    // JWT — a bearer token alone (e.g. one lifted via an XSS the nonce-based
    // CSP mostly, but not entirely, rules out) must never be enough on its
    // own to downgrade the account's own security posture.
    const passwordOk = typeof password === 'string' && await bcrypt.compare(password, user.password_hash).catch(() => false);
    const codeOk = totp.verifyTOTP(user.totp_secret, typeof code === 'string' ? code.trim() : '');
    if (!passwordOk || !codeOk)
      return res.status(401).json({ error: 'Password and a valid authentication code are both required', code: 'ERR_INVALID_CREDENTIALS' });
    const { error } = await supabase.from('users').update({ totp_secret: null, totp_enabled: false }).eq('id', user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error('totp disable', e); res.status(500).json({ error: 'Could not disable two-factor authentication', code: 'ERR_SERVER' }); }
});

module.exports = router;
