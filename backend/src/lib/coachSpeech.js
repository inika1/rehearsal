import { EdgeTTS } from 'node-edge-tts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VOICE = process.env.COACH_TTS_VOICE || 'en-GB-SoniaNeural';
const RATE = process.env.COACH_TTS_RATE || '+8%';

export function humanizeForSpeech(text) {
  return (text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/…/g, ',')
    .replace(/—/g, ', ')
    .replace(/\.{3,}/g, ', ')
    .replace(/([.!?])\s*([A-Z])/g, '$1 $2');
}

export async function synthesizeCoachSpeech(text) {
  const phrase = humanizeForSpeech(text);
  if (!phrase) return null;

  const tts = new EdgeTTS({ voice: VOICE, rate: RATE, pitch: '+0Hz', timeout: 12000 });
  const tmp = path.join(os.tmpdir(), `coach-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

  try {
    await tts.ttsPromise(phrase, tmp);
    const audio = fs.readFileSync(tmp);
    return audio.length > 0 ? audio : null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

export async function synthesizeCoachSpeechBase64(text) {
  const buf = await synthesizeCoachSpeech(text);
  return buf ? buf.toString('base64') : null;
}
