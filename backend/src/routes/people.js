import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GET /api/people
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/people
router.post('/', async (req, res) => {
  const { name, relationship } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabase
    .from('people')
    .insert({ name, relationship: relationship || '' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/people/:id  (cascades to conversations + messages)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('people').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
