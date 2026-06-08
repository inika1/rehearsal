import { normalizeInsights } from './insights.js';

const API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';

// Coaching questions that walk the user through Gottman + assertive communication prep
const GUIDED_QUESTIONS = [
  `Let's start simple — what do you actually want to say to ${'{name}'}? Just say it out loud, don't filter it yet.`,
  `What are you feeling about this situation? Try to name the emotion — not what they did, just how you feel.`,
  `Can you point to one specific thing that happened — a moment or action — rather than a general pattern?`,
  `What impact did that have on you personally? How did it affect you?`,
  `What do you actually need from them? What would feel better going forward?`,
  `What would a good outcome look like — what are you hoping changes after this conversation?`,
  `Let's put it together as an I-statement: "I feel [emotion] when [specific thing], because [impact]. I'd like [need]." Try it.`,
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
    return { reply: GUIDED_QUESTIONS[idx], done: false };
  }

  const system =
    `You are a conversation coach helping someone prepare to talk to ${person.name} ` +
    `(their ${person.relationship || 'contact'}) about: "${situation}". ` +
    `Your only job is to help them get clear on what they want to say — not to roleplay as ${person.name}, ` +
    `not to judge their words. Ask questions that help them articulate their feelings, ` +
    `name the specific thing that happened, understand the impact it had on them, figure out what they need, ` +
    `and eventually put it into one clear I-statement: "I feel X when Y, because Z. I'd like W." ` +
    `Ask one question at a time. Keep replies short — 1-2 sentences, like natural spoken English (contractions are fine). ` +
    `Sound warm and human, not stiff or robotic — no lists or jargon. ` +
    `Once the user has covered feelings, the specific event, the impact, their need, AND has attempted an I-statement ` +
    `(or clearly shown they are ready), wrap up with an encouraging closing line and set done to true. ` +
    `If you would repeat a question you have already asked, set done to true instead. ` +
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
    return normalizeInsights(
      {
        passive: 15,
        aggressive: 10,
        passive_aggressive: 15,
        assertive: 60,
        conversation_good: true,
        did_well: mockDidWellInstances(myTurns),
      },
      transcript,
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
  return normalizeInsights(raw, transcript, situation);
}

export async function analyse(person, situation, transcript) {
  if (!API_KEY) return mockAnalyse(transcript, situation);

  const system =
    `You are a communication coach analysing a coaching session transcript (Gottman + assertiveness). ` +
    `The user prepared for: "${situation}" with ${person.name}. ` +
    `Analyse ONLY what the user said (lines marked User). ` +
    `Estimate how much of the user's communication was passive (avoids confrontation, accommodates others), ` +
    `aggressive (forceful, win-focused), passive-aggressive (indirect hostility, sarcasm, avoidance), ` +
    `and assertive (clear, respectful, balances own needs with listening); the four integers must sum to 100. ` +
    `For style_notes, each style needs 1-2 instances: exact quotes plus a why in second person (you/your)—never write "the user". ` +
    `Detect if they showed any of these toward the other person: critical (attacking character), ` +
    `contemptuous (disrespect, sarcasm, disgust), defensive (deflecting blame, making excuses), ` +
    `stonewalling (shutting down, one-word answers, refusing to engage). ` +
    `For each detected pattern, quote their exact words, explain briefly in second person (you/your) why it fits, and suggest better phrasing. ` +
    `Always include did_well with 2-3 instances when possible (at least 1): quote exact words and why that moment was positive—always you/your, never "the user". ` +
    `If NONE of the four horsemen apply: set conversation_good true and all horsemen null. ` +
    `If exactly ONE horseman clearly applies, return only that horseman (plus did_well is added separately). ` +
    `If TWO or more horsemen apply, return each of them. ` +
    `If ONE horseman applies but a second is borderline, include both horseman blocks. ` +
    `If any horseman is present, conversation_good must be false. ` +
    `issue_title must be 4-6 words naming the core issue (not a full sentence). ` +
    `issue_summary must be one clear sentence in second person (you/your). Every why and instead field must also use you/your—never "the user", "user's", or "User". ` +
    `Return ONLY JSON, no markdown, matching this schema:\n${ANALYSIS_SCHEMA}`;

  const convoText = transcript
    .map((m) => `${m.role === 'me' ? 'User' : person.name}: ${m.content}`)
    .join('\n');
  const raw = await callGroq(system, [{ role: 'user', content: convoText }], 1400);
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return normalizeInsights(parsed, transcript, situation);
  } catch {
    return mockAnalyse(transcript, situation);
  }
}
