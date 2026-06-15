const RATE = 1.07;
const PITCH = 0.98;

let speechApiUrl = null;
let activeAudio = null;
let sharedAudio = null; // one persistent element, unlocked via user gesture

const VOICE_PATTERNS = [/enhanced/i, /premium/i, /neural/i, /samantha/i, /karen/i, /serena/i];

export function configureCoachSpeech(apiUrl) {
  speechApiUrl = apiUrl?.replace(/\/$/, '') || null;
}

// Call this synchronously inside the tap/click handler that starts the session.
// iOS Safari blocks audio created outside a user gesture; priming the shared element
// here satisfies the policy for all subsequent programmatic playback.
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  sharedAudio.play().catch(() => {});
  if (window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  }
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

function getBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang?.startsWith('en'));
  return en.sort((a, b) => {
    const score = (v) => VOICE_PATTERNS.reduce((s, p) => s + (p.test(v.name) ? 5 : 0), 0);
    return score(b) - score(a);
  })[0] || null;
}

function speakWithSystemVoice(phrase) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();

    // iOS Safari stops after the first sentence with a single utterance — split and chain
    const sentences = phrase.match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [phrase];
    const voice = getBestVoice();

    let i = 0;
    const next = () => {
      if (i >= sentences.length) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(sentences[i++]);
      u.rate = RATE;
      u.pitch = PITCH;
      if (voice) u.voice = voice;
      u.onend = next;
      u.onerror = next;
      window.speechSynthesis.speak(u);
    };
    next();
  });
}

function playMp3Base64(base64) {
  stopCoachSpeech();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);

  // Reuse the shared element (already unlocked by unlockAudio()) so iOS allows playback.
  // Creating a new Audio() each time breaks on iOS because it wasn't started from a gesture.
  if (!sharedAudio) sharedAudio = new Audio();
  const audio = sharedAudio;
  audio.onended = null;
  audio.onerror = null;
  audio.src = url;
  audio.load();
  activeAudio = audio;

  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    // Safari often doesn't fire the onended property — addEventListener is more reliable
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    // Once we know the duration, set a tight fallback so we never hang
    audio.addEventListener('loadedmetadata', () => {
      const ms = Number.isFinite(audio.duration) && audio.duration > 0
        ? (audio.duration + 1.5) * 1000
        : 30000;
      fallbackTimer = setTimeout(finish, ms);
    }, { once: true });
    // Hard cap in case metadata never loads
    fallbackTimer = setTimeout(finish, 45000);
    audio.play().catch(finish);
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
