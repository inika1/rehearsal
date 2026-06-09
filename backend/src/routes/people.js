import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// GET /api/people
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', req.userId)
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
    .insert({ name, relationship: relationship || '', user_id: req.userId })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/people/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // Verify ownership before deleting.
  const { data: person } = await supabase
    .from('people').select('id').eq('id', id).eq('user_id', req.userId).single();
  if (!person) return res.status(404).json({ error: 'not found' });

  // Manually cascade in case FK cascade isn't active with service role.
  const { data: convs } = await supabase.from('conversations').select('id').eq('person_id', id);
  const convIds = (convs || []).map((c) => c.id);
  if (convIds.length) {
    await supabase.from('messages').delete().in('conversation_id', convIds);
    await supabase.from('conversations').delete().eq('person_id', id);
  }

  const { error } = await supabase.from('people').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
