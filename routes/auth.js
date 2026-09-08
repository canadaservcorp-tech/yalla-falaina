const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const sec = require('../lib/security');
const router = express.Router();
const { JWT_SECRET } = process.env;
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const BCRYPT_ROUNDS = 12;
const TERMS_VERSION = '2026-09-08';
const LANGUAGES = ['ar-LB', 'ar-SY', 'ar-EG', 'ar', 'fr', 'en'];

// compared against when no account matches, so timing doesn't reveal existence
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

const sameToken = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

router.post('/register', sec.limits.register, sec.limits.credentials, async (req, res) => {
  try {
    const email = sec.normalizeEmail(req.body.email);
    const { password } = req.body;
    const name = sec.clean(req.body.name, 80);
    const phone = sec.clean(req.body.phone, 30) || '';
    const signup_source = (sec.clean(req.body.source, 40) || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '') || null;
    if (!sec.isEmail(email) || !name) return res.status(400).json({ error: 'Missing or invalid fields' });
    const pwProblem = sec.passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem });
    if (req.body.acceptTerms !== true) return res.status(400).json({ error: 'You must accept the Terms of Use' });
    // Hard 18+ gate (Sections 4.3/10) — the platform does not serve minors.
    if (req.body.confirmAge !== true) return res.status(400).json({ error: 'You must be 18 or older to use Yalla Falaina' });

    const { data: banned } = await supabase.from('banned_emails').select('email').eq('email', email).maybeSingle();
    if (banned) return res.status(403).json({ error: 'This email is blocked' });
    const { data: exists } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    // don't confirm which addresses are registered — same reply either way
    if (exists) {
      try {
        await sendEmail(email, 'Sign in to Yalla Falaina',
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
      await sendEmail(email, 'Confirm your email — Yalla Falaina',
        `<p>Welcome to Yalla Falaina. Confirm your email:</p><p><a href="${link}">${link}</a></p>`);
    } catch (e) { emailSent = false; console.error('register:verify email', e.message); }
    res.json({ success: true, message: 'Registered — check your email to verify.', userId: user.id, emailSent });
  } catch (e) { console.error('register', e); res.status(500).json({ error: 'Registration failed' }); }
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
      .select('id, email_verified').eq('email', email).maybeSingle();
    if (!user) return res.json(GENERIC);

    if (user.email_verified) {
      try {
        await sendEmail(email, "You're already verified — Yalla Falaina",
          '<p>This account is already verified. Sign in below.</p>');
      } catch (e) { console.error('resend:verified email', e.message); }
      return res.json(GENERIC);
    }

    // fresh token: an old leaked/expired link should stop working once a new one is issued
    const verify_token = crypto.randomBytes(32).toString('hex');
    const { error } = await supabase.from('users').update({ verify_token }).eq('id', user.id);
    if (error) throw error;

    const link = `${PUBLIC_URL}/api/auth/verify?token=${verify_token}&id=${user.id}`;
    try {
      await sendEmail(email, 'Confirm your email — Yalla Falaina',
        `<p>Here's your new confirmation link:</p><p><a href="${link}">${link}</a></p>`);
    } catch (e) { console.error('resend:verify email', e.message); }
    res.json(GENERIC);
  } catch (e) { console.error('resend-verification', e); res.json(GENERIC); }
});

router.post('/login', sec.limits.credentials, async (req, res) => {
  try {
    const email = sec.normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!sec.isEmail(email) || typeof password !== 'string' || !password)
      return res.status(401).json({ error: 'Invalid credentials' });
    const { data: user } = await supabase.from('users')
      .select('id, email, name, role, password_hash, email_verified, banned').eq('email', email).maybeSingle();
    // always run a comparison so a missing account isn't measurably faster
    const hash = user?.password_hash || DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash).catch(() => false);
    if (!user || user.banned || !ok) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email first' });
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '2d' });
    res.json({ success: true, token, user: { id: user.id, email, name: user.name, role: user.role } });
  } catch (e) { console.error('login', e); res.status(500).json({ error: 'Login failed' }); }
});
module.exports = router;
