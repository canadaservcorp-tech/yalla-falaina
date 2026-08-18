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

// compared against when no account matches, so timing doesn't reveal existence
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

const sameToken = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

router.post('/register', sec.limits.credentials, async (req, res) => {
  try {
    const email = sec.normalizeEmail(req.body.email);
    const { password, role } = req.body;
    const name = sec.clean(req.body.name, 80);
    const phone = sec.clean(req.body.phone, 30) || '';
    if (!sec.isEmail(email) || !name) return res.status(400).json({ error: 'Missing or invalid fields' });
    const pwProblem = sec.passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem });
    if (!['seeker', 'provider'].includes(role)) return res.status(400).json({ error: 'role must be seeker or provider' });

    const { data: banned } = await supabase.from('banned_emails').select('email').eq('email', email).maybeSingle();
    if (banned) return res.status(403).json({ error: 'This email is blocked' });
    const { data: exists } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    // don't confirm which addresses are registered — same reply either way
    if (exists) {
      await sendEmail(email, 'Connexion à TrouvePro',
        '<p>Un compte existe déjà avec ce courriel. Connectez-vous, ou réinitialisez votre mot de passe.</p>');
      return res.json({ success: true, message: 'Registered — check your email to verify.' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verify_token = crypto.randomBytes(32).toString('hex');
    const { data: user, error } = await supabase.from('users')
      .insert({ email, password_hash, name, phone, role, verify_token })
      .select('id, email, name, role').single();
    if (error) throw error;
    if (role === 'provider') await supabase.from('providers').insert({ user_id: user.id, display_name: name });
    const link = `${PUBLIC_URL}/api/auth/verify?token=${verify_token}&id=${user.id}`;
    await sendEmail(email, 'Confirmez votre courriel — TrouvePro',
      `<p>Bienvenue sur TrouvePro. Confirmez votre courriel :</p><p><a href="${link}">${link}</a></p>`);
    res.json({ success: true, message: 'Registered — check your email to verify.', userId: user.id });
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
