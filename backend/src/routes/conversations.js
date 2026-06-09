import { Router } from 'express';
import { analyse, replyAs } from '../lib/ai.js';
import { requireAuth } from '../lib/auth.js';
import { synthesizeCoachSpeechBase64 } from '../lib/coachSpeech.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// Resolve a conversation by id and verify it belongs to req.userId.
async function getOwnedConv(id, userId, selectPeople = 'name') {
  const { data: conv } = await supabase
    .from('conversations')
    .select(`*, people(${selectPeople}, user_id)`)
    .eq('id', id)
    .single();
  if (!conv || conv.people?.user_id !== userId) return null;
  return conv;
}

// GET /api/conversations?person_id=#   (only finished ones, i.e. duration set)
router.get('/', async (req, res) => {
  const { person_id } = req.query;

  // Scope to this user's people.
  const { data: userPeople } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', req.userId);
  if (!userPeople?.length) return res.json([]);
  const peopleIds = userPeople.map((p) => p.id);

  let query = supabase
    .from('conversations')
    .select('*, people(name)')
    .in('person_id', peopleIds)
    .not('duration', 'is', null)
    .order('created_at', { ascending: false });
  if (person_id) query = query.eq('person_id', person_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((c) => ({ ...c, person_name: c.people?.name })));
});

// POST /api/conversations
router.post('/', async (req, res) => {
  const { person_id, title, situation } = req.body;
  if (!person_id || !title)
    return res.status(400).json({ error: 'person_id and title required' });

  // Verify person belongs to this user.
  const { data: personData } = await supabase
    .from('people')
    .select('name, user_id')
    .eq('id', person_id)
    .single();
  if (!personData || personData.user_id !== req.userId)
    return res.status(403).json({ error: 'forbidden' });

  const { data, error } = await supabase
    .from('conversations')
    .insert({ person_id, title, situation: situation || '' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const firstQuestion = `Let's test prep you for this conversation. What do you want to say to ${personData.name} — just say it out loud, don't filter it yet.`;
  const [_, openingAudio] = await Promise.all([
    supabase
      .from('messages')
      .insert({ conversation_id: data.id, role: 'them', content: firstQuestion }),
    synthesizeCoachSpeechBase64(firstQuestion),
  ]);

  res.json({
    ...data,
    opening_audio: openingAudio,
    messages: [{ role: 'them', content: firstQuestion }],
  });
});

// GET /api/conversations/:id   (with person name + messages)
router.get('/:id', async (req, res) => {
  const conv = await getOwnedConv(req.params.id, req.userId);
  if (!conv) return res.status(404).json({ error: 'not found' });

  const { data: messages, error: e2 } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conv.id)
    .order('id', { ascending: true });
  if (e2) return res.status(500).json({ error: e2.message });

  res.json({ ...conv, person_name: conv.people?.name, messages });
});

// POST /api/conversations/:id/turn
router.post('/:id/turn', async (req, res) => {
  const conv = await getOwnedConv(req.params.id, req.userId, '*');
  if (!conv) return res.status(404).json({ error: 'not found' });
  const person = conv.people;
  const { content } = req.body;

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
    const { reply, done } = await replyAs(person, conv.situation, history);
    const audioPromise = synthesizeCoachSpeechBase64(reply);
    await supabase
      .from('messages')
      .insert({ conversation_id: conv.id, role: 'them', content: reply });
    const audio = await audioPromise;
    res.json({ reply, done, audio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', async (req, res) => {
  const conv = await getOwnedConv(req.params.id, req.userId);
  if (!conv) return res.status(404).json({ error: 'not found' });
  // Delete messages first in case FK cascade isn't active with service role.
  await supabase.from('messages').delete().eq('conversation_id', conv.id);
  const { error } = await supabase.from('conversations').delete().eq('id', conv.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/conversations/:id/finish
router.post('/:id/finish', async (req, res) => {
  const conv = await getOwnedConv(req.params.id, req.userId, '*');
  if (!conv) return res.status(404).json({ error: 'not found' });
  const person = conv.people;
  const { duration } = req.body;

  const { data: transcript, error: tErr } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conv.id)
    .order('id', { ascending: true });
  if (tErr) return res.status(500).json({ error: tErr.message });

  try {
    const a = await analyse(person, conv.situation, transcript);
    const wasUntitled = !conv.title || conv.title.trim().toLowerCase() === 'untitled';
    const { data: updated, error: uErr } = await supabase
      .from('conversations')
      .update({
        duration: duration || '0:00',
        title: wasUntitled ? a.issueTitle : conv.title,
        passive: a.styles.passive,
        aggressive: a.styles.aggressive,
        passive_aggressive: a.styles.passive_aggressive,
        assertive: a.styles.assertive,
        insights: { blocks: a.blocks, style_notes: a.styleNotes, issue_title: a.issueTitle },
        issue_summary: a.issueSummary,
        tension: a.styles.assertive,
        emotion: null,
        insight_tend: null,
        insight_try: null,
        insight_used: null,
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
