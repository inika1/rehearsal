import { Router } from 'express';
import { synthesizeCoachSpeech } from '../lib/coachSpeech.js';

const router = Router();

// POST /api/speech/coach  { "text": "..." }  -> audio/mpeg
router.post('/coach', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text required' });
  }

  try {
    const audio = await synthesizeCoachSpeech(text);
    if (!audio) return res.status(500).json({ error: 'synthesis failed' });
    res.setHeader('content-type', 'audio/mpeg');
    res.setHeader('cache-control', 'no-store');
    res.send(audio);
  } catch (err) {
    console.error('[speech/coach]', err.message);
    res.status(500).json({ error: 'speech synthesis failed' });
  }
});

export default router;
