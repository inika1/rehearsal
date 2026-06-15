import { normalizeInsights, splitTranscriptByPrompt } from './insights.js';

const API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';

// Coaching questions that walk the user through Gottman + assertive communication prep
const GUIDED_QUESTIONS = [
  `Let's start simple — say the rough version as if ${'{name}'} is right there: "${'{name}'}, ...". Don't filter it yet.`,
  `What are you feeling about this situation? Try to name the emotion — not what they did, just how you feel.`,
  `Now say the specific moment directly to them: "When you..." Keep it to one moment or action, not a general pattern.`,
  `What impact did that have on you personally? How did it affect you?`,
  `Try making the request directly: "I'd like..." or "I need...". What do you actually want from them going forward?`,
  `What would a good outcome look like — what are you hoping changes after this conversation?`,
  `You've covered everything you need. Is there anything else you want to add before we wrap up?`,
];

const ANALYSIS_SCHEMA = `{
  "passive": <0-100 int>,
  "aggressive": <0-100 int>,
  "passive_aggressive": <0-100 int>,
  "assertive": <0-100 int>,
  "style_notes": {
    "passive": {"instances": [{"quote": "<exact words they said>", "why": "<second person: why this shows passive, use you/your>"}]},
    "aggressive": {"instances": [{"quote": "...", "why": "..."}]},
    "passive_aggressive": {"instances": [{"quote": "...", "why": "..."}]},
    "assertive": {"instances": [{"quote": "...", "why": "..."}]}
  },
  "critical": null | {"quote": "<exact words they said>", "why": "<second person: why this was critical>", "instead": "<better phrasing>"},
  "contemptuous": null | {"quote": "...", "why": "...", "instead": "..."},
  "defensive": null | {"quote": "...", "why": "...", "instead": "..."},
  "stonewalling": null | {"quote": "...", "why": "...", "instead": "..."},
  "conversation_good": <true if NONE of the four horsemen apply to the user, else false>,
  "issue_title": "<4-6 words: short label for the issue, e.g. 'Kieran not taking bins out'>",
  "issue_summary": "<one sentence in second person (you/your) summarising the issue, not 'The user...'>",
  "did_well": {
    "instances": [
      {"quote": "<exact words they said>", "why": "<second person: why this moment was positive>"},
      {"quote": "...", "why": "..."}
    ]
  },
  "coach_pointers": {
    "tips": [{"text": "<tip based only on answers where the user talked to the coach for advice/context>"}],
    "phrase_options": [
      {"label": "Softer", "text": "<gentler way they could say the core request to the person>"},
      {"label": "More direct", "text": "<clearer, firmer way they could say the core request to the person>"}
    ]
  }
}`;

async function callGroq(system, messages, maxTokens = 400) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error('Groq API error: ' + res.status);
  const data = await res.json();
  return data.choices[0].message.content;
}

const WRAP_UP = `You've got everything you need — you know what you feel, what specifically happened, how it affected you, and what you want. You're ready for this conversation.`;

export async function replyAs(person, situation, history) {
  const userMsgCount = history.filter((m) => m.role === 'me').length;

  if (!API_KEY) {
    if (userMsgCount >= GUIDED_QUESTIONS.length) {
      return { reply: WRAP_UP, done: true };
    }
    const idx = Math.max(0, userMsgCount - 1);
    return { reply: GUIDED_QUESTIONS[idx].replaceAll('{name}', person.name), done: false };
  }

  const system =
    `You are a conversation coach helping someone prepare to talk to ${person.name} ` +
    `(their ${person.relationship || 'contact'}) about: "${situation}". ` +
    `Your only job is to help them get clear on what they want to say — not to roleplay as ${person.name}, ` +
    `not to judge their words. Ask questions that help them articulate their feelings, ` +
    `name the specific thing that happened, understand the impact it had on them, and figure out what they need. ` +
    `Do not roleplay as ${person.name} or answer on ${person.name}'s behalf. ` +
    `Ask one question at a time. Keep replies short — 1-2 sentences, like natural spoken English (contractions are fine). ` +
    `Sound warm and human, not stiff or robotic — no lists or jargon. ` +
    `Once you have gathered their emotion, the specific event, the impact it had on them, and what they need — ` +
    `construct the I-statement yourself using their words: "I feel [emotion] when [specific event], because [impact]. I'd like [need]." ` +
    `Present it naturally, like: "Okay, so you could try saying something like: [I-statement]. Does that feel right? And is there anything that hasn't been said yet — something that's still sitting with you?" Set done to false for that message. ` +
    `On the very next reply after presenting the I-statement — whether they add something or say they're ready — ` +
    `give a brief encouraging closing (incorporating any addition they made) and set done to true. ` +
    `ALWAYS respond with JSON only — no markdown, no extra text: {"reply": "<your message>", "done": <true|false>}`;

  const messages = history.map((m) => ({
    role: m.role === 'me' ? 'user' : 'assistant',
    content: m.content,
  }));

  const raw = await callGroq(system, messages, 300);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const reply = String(parsed.reply || '').trim();
      if (reply) return { reply, done: Boolean(parsed.done) };
    } catch { /* fall through */ }
  }
  const fallback = raw.replace(/\{[\s\S]*\}/, '').trim();
  return { reply: fallback || "Tell me more — what's on your mind?", done: false };
}

function mockDidWellInstances(myTurns) {
  const nice = myTurns.filter(
    (m) =>
      m.content.length > 12 &&
      (/i feel|i need|i'd like|i would like|thank|appreciate|understand|help me|when you/i.test(
        m.content
      ) ||
        (!/\b(always|never|stupid|ridiculous|hate)\b/i.test(m.content) && m.content.length > 40))
  );
  const picks = (nice.length ? nice : myTurns).slice(0, 3);
  if (!picks.length) {
    return {
      instances: [
        {
          quote: 'Your effort in this session',
          why: 'You showed up and worked through it instead of avoiding the conversation.',
        },
      ],
    };
  }
  return {
    instances: picks.map((m, i) => ({
      quote: m.content,
      why:
        i === 0
          ? 'You named feelings or needs in a constructive way.'
          : 'Another moment where you stayed clear and respectful.',
    })),
  };
}

function mockAnalyse(transcript, situation = '') {
  const { directPractice, coachContext } = splitTranscriptByPrompt(transcript);
  const myTurns = directPractice;
  if (!myTurns.length) {
    return normalizeInsights(
      {
        passive: 0,
        aggressive: 0,
        passive_aggressive: 0,
        assertive: 0,
        conversation_good: true,
        coachTranscript: coachContext,
      },
      directPractice,
      situation
    );
  }
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
    return normalizeInsights(
      {
        passive: 15,
        aggressive: 10,
        passive_aggressive: 15,
        assertive: 60,
        conversation_good: true,
        did_well: mockDidWellInstances(myTurns),
        coachTranscript: coachContext,
      },
      directPractice,
      situation
    );
  }

  const raw = {
    passive,
    aggressive,
    passive_aggressive,
    assertive,
    conversation_good: false,
  };
  raw.did_well = mockDidWellInstances(myTurns);
  raw.coachTranscript = coachContext;
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
  return normalizeInsights(raw, directPractice, situation);
}

export async function analyse(person, situation, transcript) {
  if (!API_KEY) return mockAnalyse(transcript, situation);

  const { directPractice, coachContext } = splitTranscriptByPrompt(transcript);

  const system =
    `You are a communication coach analysing a coaching session transcript (Gottman + assertiveness). ` +
    `The user prepared for: "${situation}" with ${person.name}. ` +
    `You will receive two transcript sections. Analyse communication style ONLY from DIRECT PRACTICE lines, where the user was pretending to speak to ${person.name}. ` +
    `Do NOT score, quote, or criticise the user's language from COACH CONTEXT lines; those are places where the user was talking to you for advice or context. ` +
    `Score the DIRECT PRACTICE language across four dimensions that MUST sum to 100. Be honest and discriminating — most real conversations are NOT mostly assertive. ` +
    `PASSIVE (score high if): excessive apologising, heavy hedging ("sorry", "just", "I guess", "maybe", "no rush", "it's fine"), backing away from what they need, not stating wants clearly. Example: "Sorry I even brought it up, it's probably nothing." ` +
    `AGGRESSIVE (score high if): blaming, absolutes ("you always", "you never"), ultimatums, dismissing the other person's perspective, threatening language. Example: "This is completely unacceptable and you need to fix it now." ` +
    `PASSIVE-AGGRESSIVE (score high if): surface agreement with embedded resentment, sarcasm, veiled criticism, martyrdom, guilt-tripping. Example: "Fine, I'll just do it myself like I always do." ` +
    `ASSERTIVE (score high if): clear I-statements ("I feel", "I need", "When X happens I feel Y"), naming specific impact, making concrete requests, acknowledging the other person's view while holding their own. Example: "When you leave dishes in the sink I feel overwhelmed. I need us to split this more evenly." ` +
    `Give the dominant style at least 40. Do not default to passive — read the actual words carefully. ` +
    `For style_notes, include 1-2 real instances per style (only for styles that genuinely appear); exact quotes plus a why in second person (you/your)—never write "the user". ` +
    `Detect if they showed any of these toward the other person: critical (attacking character), ` +
    `contemptuous (disrespect, sarcasm, disgust), defensive (deflecting blame, making excuses), ` +
    `stonewalling (shutting down, one-word answers, refusing to engage). ` +
    `For each detected pattern, quote their exact words, explain briefly in second person (you/your) why it fits, and suggest better phrasing. ` +
    `Always include did_well with 2-3 instances when possible (at least 1): quote exact words and why that moment was positive—always you/your, never "the user". ` +
    `Also include coach_pointers based ONLY on COACH CONTEXT lines: 1-3 practical tips and exactly two phrase_options. ` +
    `The two phrase_options should say the same core request with different intensity: label one "Softer" and make it gentler/sugarcoated, label the other "More direct" and make it clear but still respectful. ` +
    `If NONE of the four horsemen apply: set conversation_good true and all horsemen null. ` +
    `If TWO OR MORE horsemen apply, return ALL of them — do not drop any. Each must include quote, why, and instead. ` +
    `If any horseman is present, conversation_good must be false. ` +
    `issue_title must be 4-6 words naming the core issue (not a full sentence). ` +
    `issue_summary must be one clear sentence in second person (you/your). Every why and instead field must also use you/your—never "the user", "user's", or "User". ` +
    `Return ONLY JSON, no markdown, matching this schema:\n${ANALYSIS_SCHEMA}`;

  const directText = directPractice
    .map((m) => `${m.role === 'me' ? 'User' : person.name}: ${m.content}`)
    .join('\n');
  const coachText = coachContext
    .map((m) => `User: ${m.content}`)
    .join('\n');
  const convoText =
    `DIRECT PRACTICE LINES (use for style scoring, style notes, horsemen, did_well):\n${directText || '(none)'}\n\n` +
    `COACH CONTEXT LINES (use only for coach_pointers):\n${coachText || '(none)'}`;
  const raw = await callGroq(system, [{ role: 'user', content: convoText }], 1600);
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    parsed.coachTranscript = coachContext;
    return normalizeInsights(parsed, directPractice, situation);
  } catch {
    return mockAnalyse(transcript, situation);
  }
}
