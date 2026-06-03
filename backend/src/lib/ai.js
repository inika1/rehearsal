import { DEFAULT_GOOD_MESSAGE, normalizeInsights } from './insights.js';

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.0-flash';

const ANALYSIS_SCHEMA = `{
  "passive": <0-100 int>,
  "aggressive": <0-100 int>,
  "passive_aggressive": <0-100 int>,
  "assertive": <0-100 int>,
  "critical": null | {"quote": "<exact words the user said>", "why": "<why this was critical>", "instead": "<better phrasing>"},
  "contemptuous": null | {"quote": "...", "why": "...", "instead": "..."},
  "defensive": null | {"quote": "...", "why": "...", "instead": "..."},
  "stonewalling": null | {"quote": "...", "why": "...", "instead": "..."},
  "conversation_good": <true if NONE of the four horsemen apply to the user, else false>,
  "good_message": "<only when conversation_good is true: short encouraging message>"
}`;

async function callGemini(system, messages, maxTokens = 400) {
  const contents = messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) throw new Error('Gemini API error: ' + res.status);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

export async function replyAs(person, situation, history) {
  if (!API_KEY) {
    const canned = [
      `Ah, has this been going on for a while or is this a recent thing?`,
      `Hmm, so what emotions are you feeling most strongly right now?`,
      `Right. So what's bothering you most about this situation?`,
      `Yeah, I can see why that would get under your skin. Ideally, what would you like to happen now?`,
      `Fair enough. If I asked them what's been happening, what do you think they'd say?`,
      `Got it. So what's stopping you from bringing it up with them?`,
      `Okay perfect. I see where you are coming from. Here is what I think, end the call to find out`,
    ];
    return (
      canned[Math.min(history.filter((m) => m.role === 'me').length - 1, canned.length - 1)] ||
      canned[0]
    );
  }

  const system =
    `You are roleplaying as ${person.name}, the other person in a difficult conversation. ` +
    `Your relationship to the user: ${person.relationship || 'unspecified'}. ` +
    `The user is practising this conversation: "${situation}". ` +
    `Stay fully in character as ${person.name}. Be realistic — react naturally, don't be a pushover, ` +
    `but don't be cartoonishly hostile. Keep replies short (1-3 sentences), like real speech.`;

  const messages = history.map((m) => ({
    role: m.role === 'me' ? 'user' : 'assistant',
    content: m.content,
  }));

  return callGemini(system, messages, 200);
}

function mockAnalyse(transcript) {
  const myTurns = transcript.filter((m) => m.role === 'me');
  const text = myTurns.map((m) => m.content.toLowerCase()).join(' ');
  const hedges = (text.match(/\b(sorry|just|maybe|kind of|i guess|no rush|it's fine)\b/g) || [])
    .length;
  const hostile = (text.match(/\b(always|never|you always|ridiculous|stupid)\b/g) || []).length;
  const passive = Math.min(60, 20 + hedges * 10);
  const aggressive = Math.min(50, hostile * 15);
  const passive_aggressive = Math.min(40, hedges > 0 && hostile > 0 ? 25 : 10);
  const assertive = Math.max(10, 100 - passive - aggressive - passive_aggressive);

  const lastQuote = myTurns.length ? myTurns[myTurns.length - 1].content : '';
  const hasIssue = hedges > 2 || hostile > 0;

  if (!hasIssue || !lastQuote) {
    return normalizeInsights({
      passive: 15,
      aggressive: 10,
      passive_aggressive: 15,
      assertive: 60,
      conversation_good: true,
      good_message: DEFAULT_GOOD_MESSAGE,
    });
  }

  const raw = {
    passive,
    aggressive,
    passive_aggressive,
    assertive,
    conversation_good: false,
  };
  if (hostile > 0) {
    raw.critical = {
      quote: lastQuote,
      why: 'Phrasing like “always” or “never” attacks the person instead of the problem.',
      instead: 'Describe one specific moment and how it affected you.',
    };
  } else if (hedges > 2) {
    raw.defensive = {
      quote: lastQuote,
      why: 'Heavy hedging can sound like you are backing away from what you need.',
      instead: 'State one clear request without apologising for having it.',
    };
  }
  return normalizeInsights(raw);
}

export async function analyse(person, situation, transcript) {
  if (!API_KEY) return mockAnalyse(transcript);

  const system =
    `You are a communication coach analysing a rehearsal transcript (Gottman + assertiveness). ` +
    `The user practised: "${situation}" with ${person.name}. ` +
    `Analyse ONLY what the user said (lines marked User). ` +
    `Estimate how much of the user's communication was passive, aggressive, passive-aggressive, and assertive; ` +
    `the four integers must sum to 100. ` +
    `Detect if the user showed any of these toward the other person: critical (attacking character), ` +
    `contemptuous (disrespect, sarcasm, disgust), defensive (deflecting blame, making excuses), ` +
    `stonewalling (shutting down, one-word answers, refusing to engage). ` +
    `For each detected pattern, quote their exact words, explain briefly why it fits, and suggest better phrasing. ` +
    `If conversation_good is true, set critical, contemptuous, defensive, and stonewalling to null — ` +
    `do not flag any horseman. ` +
    `If any horseman is present, conversation_good must be false. ` +
    `Return ONLY JSON, no markdown, matching this schema:\n${ANALYSIS_SCHEMA}`;

  const convoText = transcript
    .map((m) => `${m.role === 'me' ? 'User' : person.name}: ${m.content}`)
    .join('\n');
  const raw = await callGemini(system, [{ role: 'user', content: convoText }], 900);
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return normalizeInsights(parsed);
  } catch {
    return normalizeInsights({
      passive: 25,
      aggressive: 25,
      passive_aggressive: 25,
      assertive: 25,
      conversation_good: true,
      good_message: DEFAULT_GOOD_MESSAGE,
    });
  }
}
