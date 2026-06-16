import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

const RATE = Platform.OS === 'ios' ? 1.06 : 1.08;
const PITCH = 0.98;

let nativeVoiceId = null;

const VOICE_PATTERNS = [/enhanced/i, /premium/i, /neural/i, /samantha/i, /karen/i, /serena/i];

export function configureCoachSpeech() {
  if (Platform.OS !== 'web') {
    setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      interruptionMode: 'duckOthers',
    }).catch(() => {});
  }
}

export function stopCoachSpeech() {
  try { Speech.stop(); } catch { /* ignore */ }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
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

async function pickNativeVoiceId() {
  if (nativeVoiceId) return nativeVoiceId;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const en = voices.filter((v) => v.language?.startsWith('en'));
    for (const pat of VOICE_PATTERNS) {
      const match = en.find((v) => pat.test(v.name || '') || pat.test(v.identifier || ''));
      if (match) { nativeVoiceId = match.identifier; return nativeVoiceId; }
    }
    if (en[0]) nativeVoiceId = en[0].identifier;
  } catch { /* ignore */ }
  return nativeVoiceId;
}

function speakWithSystemVoice(phrase) {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
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

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 20000);
    pickNativeVoiceId().then((voice) => {
      Speech.speak(phrase, {
        language: 'en-GB',
        voice: voice || undefined,
        pitch: PITCH,
        rate: RATE,
        onDone: () => { clearTimeout(timeout); resolve(); },
        onStopped: () => { clearTimeout(timeout); resolve(); },
        onError: () => { clearTimeout(timeout); resolve(); },
      });
    });
  });
}

export async function speakCoachText(text) {
  const phrase = humanizeForSpeech(text);
  if (!phrase) return;
  await speakWithSystemVoice(phrase);
}
