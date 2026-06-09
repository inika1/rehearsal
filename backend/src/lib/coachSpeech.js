const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
const ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';
const ELEVENLABS_TIMEOUT_MS = Number(process.env.ELEVENLABS_TIMEOUT_MS || 12000);

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
  if (!ELEVENLABS_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}` +
    `?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: phrase,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`ElevenLabs API error: ${res.status}${detail ? ` ${detail}` : ''}`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return audio.length > 0 ? audio : null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function synthesizeCoachSpeechBase64(text) {
  const buf = await synthesizeCoachSpeech(text);
  return buf ? buf.toString('base64') : null;
}
