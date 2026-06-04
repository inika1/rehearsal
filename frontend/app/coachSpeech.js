const RATE = 1.07;
const PITCH = 0.98;

let speechApiUrl = null;
let activeAudio = null;

const VOICE_PATTERNS = [/enhanced/i, /premium/i, /neural/i, /samantha/i, /karen/i, /serena/i];

export function configureCoachSpeech(apiUrl) {
  speechApiUrl = apiUrl?.replace(/\/$/, '') || null;
}

export function stopCoachSpeech() {
  if (typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
}

function humanizeForSpeech(text) {
  return (text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/…/g, ',')
    .replace(/—/g, ', ')
    .replace(/\.{3,}/g, ', ');
}

function speakWithSystemVoice(phrase) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(phrase);
    u.rate = RATE;
    u.pitch = PITCH;
    const voices = window.speechSynthesis.getVoices();
    const en = voices.filter((v) => v.lang?.startsWith('en'));
    u.voice = en.sort((a, b) => {
      const score = (v) => VOICE_PATTERNS.reduce((s, p) => s + (p.test(v.name) ? 5 : 0), 0);
      return score(b) - score(a);
    })[0];
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}

function playMp3Base64(base64) {
  stopCoachSpeech();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = 'auto';
  activeAudio = audio;
  return new Promise((resolve) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.play().catch(resolve);
  });
}

async function fetchNeuralSpeech(text) {
  if (!speechApiUrl) return null;
  const res = await fetch(`${speechApiUrl}/api/speech/coach`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (!buf?.byteLength) return null;
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function speakCoachText(text, { audioBase64 } = {}) {
  const phrase = humanizeForSpeech(text);
  if (!phrase) return;

  if (audioBase64) {
    await playMp3Base64(audioBase64);
    return;
  }

  try {
    const base64 = await fetchNeuralSpeech(phrase);
    if (base64) {
      await playMp3Base64(base64);
      return;
    }
  } catch {
    /* fallback */
  }

  await speakWithSystemVoice(phrase);
}
