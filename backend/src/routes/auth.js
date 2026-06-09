import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { signToken } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert({ email: email.toLowerCase().trim(), password_hash })
    .select('id, email')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
    return res.status(500).json({ error: error.message });
  }

  res.json({ token: signToken(data), user: { id: data.id, email: data.email } });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { data } = await supabase
    .from('users')
    .select('id, email, password_hash')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (!data || !(await bcrypt.compare(password, data.password_hash)))
    return res.status(401).json({ error: 'Incorrect email or password' });

  res.json({ token: signToken(data), user: { id: data.id, email: data.email } });
});

export default router;
