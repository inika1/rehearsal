import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { replyAs, analyse } from '../lib/ai.js';

const router = Router();

// GET /api/conversations?person_id=#   (only finished ones, i.e. tension set)
router.get('/', async (req, res) => {
  const { person_id } = req.query;
  let query = supabase
    .from('conversations')
    .select('*, people(name)')
    .not('tension', 'is', null)
    .order('created_at', { ascending: false });
  if (person_id) query = query.eq('person_id', person_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  // Flatten joined person name to match the original API shape.
  res.json(data.map((c) => ({ ...c, person_name: c.people?.name })));
});

// POST /api/conversations
router.post('/', async (req, res) => {
  const { person_id, title, situation } = req.body;
  if (!person_id || !title)
    return res.status(400).json({ error: 'person_id and title required' });
  const { data, error } = await supabase
    .from('conversations')
    .insert({ person_id, title, situation: situation || '' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/conversations/:id   (with person name + messages)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { data: conv, error: e1 } = await supabase
    .from('conversations')
    .select('*, people(name)')
    .eq('id', id)
    .single();
  if (e1 || !conv) return res.status(404).json({ error: 'not found' });

  const { data: messages, error: e2 } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', id)
    .order('id', { ascending: true });
  if (e2) return res.status(500).json({ error: e2.message });

  res.json({ ...conv, person_name: conv.people?.name, messages });
});

// POST /api/conversations/:id/turn
router.post('/:id/turn', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  const { data: conv, error: e1 } = await supabase
    .from('conversations')
    .select('*, people(*)')
    .eq('id', id)
    .single();
  if (e1 || !conv) return res.status(404).json({ error: 'not found' });
  const person = conv.people;

  const { error: insErr } = await supabase
    .from('messages')
    .insert({ conversation_id: conv.id, role: 'me', content });
  if (insErr) return res.status(500).json({ error: insErr.message });

  const { data: history, error: hErr } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conv.id)
    .order('id', { ascending: true });
  if (hErr) return res.status(500).json({ error: hErr.message });

  try {
    const reply = await replyAs(person, conv.situation, history);
    await supabase
      .from('messages')
      .insert({ conversation_id: conv.id, role: 'them', content: reply });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations/:id/finish
router.post('/:id/finish', async (req, res) => {
  const { id } = req.params;
  const { duration } = req.body;

  const { data: conv, error: e1 } = await supabase
    .from('conversations')
    .select('*, people(*)')
    .eq('id', id)
    .single();
  if (e1 || !conv) return res.status(404).json({ error: 'not found' });
  const person = conv.people;

  const { data: transcript, error: tErr } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conv.id)
    .order('id', { ascending: true });
  if (tErr) return res.status(500).json({ error: tErr.message });

  try {
    const a = await analyse(person, conv.situation, transcript);
    const { data: updated, error: uErr } = await supabase
      .from('conversations')
      .update({
        duration: duration || '0:00',
        tension: a.tension,
        emotion: a.emotion,
        insight_tend: a.insight_tend,
        insight_try: a.insight_try,
        insight_used: a.insight_used,
      })
      .eq('id', conv.id)
      .select()
      .single();
    if (uErr) return res.status(500).json({ error: uErr.message });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
