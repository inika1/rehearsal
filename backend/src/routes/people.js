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
  const { data: conversations, error: conversationLookupError } = await supabase
    .from('conversations')
    .select('id')
    .eq('person_id', id);
  if (conversationLookupError) {
    return res.status(500).json({ error: conversationLookupError.message });
  }

  const conversationIds = conversations.map((conversation) => conversation.id);
  if (conversationIds.length) {
    const { error: messageError } = await supabase
      .from('messages')
      .delete()
      .in('conversation_id', conversationIds);
    if (messageError) return res.status(500).json({ error: messageError.message });

    const { error: conversationError } = await supabase
      .from('conversations')
      .delete()
      .eq('person_id', id);
    if (conversationError) return res.status(500).json({ error: conversationError.message });
  }

  const { error: personError } = await supabase.from('people').delete().eq('id', id);
  if (personError) return res.status(500).json({ error: personError.message });

  res.json({ ok: true });
});

export default router;
