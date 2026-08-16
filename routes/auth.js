const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const router = express.Router();
const { JWT_SECRET } = process.env;
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    if (!['seeker', 'provider'].includes(role)) return res.status(400).json({ error: 'role must be seeker or provider' });
    const { data: banned } = await supabase.from('banned_emails').select('email').eq('email', email).maybeSingle();
    if (banned) return res.status(403).json({ error: 'This email is blocked' });
    const { data: exists } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (exists) return res.status(400).json({ error: 'Email exists' });
    const password_hash = await bcrypt.hash(password, 10);
    const verify_token = crypto.randomBytes(24).toString('hex');
    const { data: user, error } = await supabase.from('users')
      .insert({ email, password_hash, name, phone: phone || '', role, verify_token })
      .select('id, email, name, role').single();
    if (error) throw error;
    if (role === 'provider') await supabase.from('providers').insert({ user_id: user.id, display_name: name });
    const link = `${PUBLIC_URL}/api/auth/verify?token=${verify_token}&id=${user.id}`;
    await sendEmail(email, 'Confirmez votre courriel — TrouvePro',
      `<p>Bienvenue sur TrouvePro. Confirmez votre courriel :</p><p><a href="${link}">${link}</a></p>`);
    res.json({ success: true, message: 'Registered — check your email to verify.', userId: user.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/verify', async (req, res) => {
  const { token, id } = req.query;
  const { data: u } = await supabase.from('users').select('id, verify_token').eq('id', id).maybeSingle();
  if (!u || u.verify_token !== token) return res.status(400).send('Invalid or expired link');
  await supabase.from('users').update({ email_verified: true, verify_token: null }).eq('id', id);
  res.redirect(`${PUBLIC_URL}/?verified=1`);
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (!user || user.banned || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email first' });
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, email, name: user.name, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
