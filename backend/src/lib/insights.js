const HORSEMAN_KEYS = ['critical', 'contemptuous', 'defensive', 'stonewalling'];
const STYLE_KEYS = ['passive', 'aggressive', 'passive_aggressive', 'assertive'];
const DIRECT_PRACTICE_RE =
  /\b(as if|right there|directly to them|say it to them|practice saying|practise speaking|try saying|now say|when you\.\.\.|request directly|i'd like\.\.\.|i need\.\.\.)\b/i;

const STYLE_MATCHERS = {
  passive: /\b(sorry|just|maybe|kind of|i guess|no rush|it's fine|whatever you want|if that's ok)\b/i,
  aggressive: /\b(always|never|you always|you never|ridiculous|stupid|get over it|your fault)\b/i,
  passive_aggressive: /\b(fine|whatever|sure)\b.*\b(but|though|guess)\b|\bnot mad\b|\bi'm fine\b/i,
  assertive: /\b(i feel|i felt|i need|i'd like|i would like|when you|because)\b/i,
};

const GENERIC_DID_WELL_RE =
  /\b(your messages|your effort|this session|this rehearsal|stayed constructive overall|building readiness)\b/i;

const LOW_STYLE_WHY = {
  passive: (q) => `Saying “${truncate(q)}” is direct—you state your point without backing away.`,
  aggressive: (q) => `“${truncate(q)}” focuses on your experience rather than attacking them.`,
  passive_aggressive: (q) => `“${truncate(q)}” is straightforward rather than indirect or sarcastic.`,
  assertive: (q) => `“${truncate(q)}” is more tentative or accommodating than a full I-statement.`,
};

const HIGH_STYLE_WHY = {
  passive: () => 'You softened your point or avoided conflict here.',
  aggressive: () => 'You used forceful or win-focused language here.',
  passive_aggressive: () => 'You agreed on the surface while pushing back indirectly here.',
  assertive: () => 'You named clear feelings, impact, or needs here.',
};

function truncate(s, n = 48) {
  const t = (s || '').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function userTurns(transcript = []) {
  return transcript
    .filter((m) => m.role === 'me' && m.content?.trim())
    .map((m) => ({ ...m, content: m.content.trim().replace(/\s+/g, ' ') }));
}

export function splitTranscriptByPrompt(transcript = []) {
  const directPractice = [];
  const coachContext = [];
  let lastCoachWasDirectPractice = false;

  for (const message of transcript || []) {
    if (message.role === 'them') {
      lastCoachWasDirectPractice = DIRECT_PRACTICE_RE.test(message.content || '');
      continue;
    }
    if (message.role !== 'me' || !message.content?.trim()) continue;

    if (lastCoachWasDirectPractice) {
      directPractice.push(message);
    } else {
      coachContext.push(message);
    }
  }

  return { directPractice, coachContext };
}

function pickBestUserQuote(transcript = []) {
  const turns = userTurns(transcript);
  if (!turns.length) return '';
  const assertive =
    turns.find((m) => STYLE_MATCHERS.assertive.test(m.content)) ||
    turns.find((m) => /\b(feel|need|want|hurt|frustrated|upset|because|when)\b/i.test(m.content));
  const picked = assertive || turns.reduce((best, m) => (m.content.length > best.content.length ? m : best), turns[0]);
  return truncate(picked.content, 130);
}

/** Rewrite third-person "the user…" copy into second person for the insights UI. */
export function humanizeInsightText(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim();
  if (!s) return '';

  s = s
    .replace(/^The user is trying to work through a situation where they /i, "You're ")
    .replace(/^This line shows (?:that )?the user (?:is|was|has been) /i, 'This shows you ')
    .replace(/^This (?:line|phrase|wording) (?:shows|suggests|indicates) (?:that )?the user /i, 'This shows you ')
    .replace(/^This shows (?:that )?the user /i, 'This shows you ')
    .replace(/^The user could /i, 'You could ')
    .replace(/^The user should /i, 'You should ')
    .replace(/^The user can /i, 'You can ')
    .replace(/^They feel /i, 'You feel ')
    .replace(/^They felt /i, 'You felt ')
    .replace(/^The user feels /i, 'You feel ')
    .replace(/^The user felt /i, 'You felt ')
    .replace(/^The user is /i, 'You are ')
    .replace(/^The user was /i, 'You were ')
    .replace(/^The user has /i, 'You have ')
    .replace(/^The user /i, 'You ')
    .replace(/\bthe user's\b/gi, 'your')
    .replace(/\bthe user's own\b/gi, 'your own')
    .replace(/\btheir own needs\b/gi, 'your own needs')
    .replace(/\bthe user\b/gi, 'you')
    .replace(/\buser's\b/gi, 'your');

  s = s
    .replace(/\bYou is\b/g, 'You are')
    .replace(/\byou is\b/g, 'you are')
    .replace(/\bYou was\b/g, 'You were')
    .replace(/\byou was\b/g, 'you were')
    .replace(/\bYou has\b/g, 'You have')
    .replace(/\byou has\b/g, 'you have')
    .replace(/\bYou are being\s+(\w+ing)\b/g, "You're $1");

  return s;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : fallback;
}

export function normalizeStyles(raw) {
  let passive = num(raw.passive, 25);
  let aggressive = num(raw.aggressive, 25);
  let passive_aggressive = num(raw.passive_aggressive, 25);
  let assertive = num(raw.assertive, 25);
  const sum = passive + aggressive + passive_aggressive + assertive;
  if (sum === 0) {
    return { passive: 25, aggressive: 25, passive_aggressive: 25, assertive: 25 };
  }
  if (sum !== 100) {
    passive = Math.round((passive / sum) * 100);
    aggressive = Math.round((aggressive / sum) * 100);
    passive_aggressive = Math.round((passive_aggressive / sum) * 100);
    assertive = 100 - passive - aggressive - passive_aggressive;
  }
  return { passive, aggressive, passive_aggressive, assertive };
}

function pickStyleInstance(item) {
  if (!item || typeof item !== 'object') return null;
  const quote = (item.quote || item.example || '').trim();
  if (!quote) return null;
  const why = humanizeInsightText(item.why || item.reason || '');
  return { quote, why: why || 'This line shaped how much of this style you used.' };
}

function pickStyleNote(raw, key) {
  const b = raw.style_notes?.[key] ?? raw[`${key}_note`];
  if (!b || typeof b !== 'object') return null;

  if (Array.isArray(b.instances)) {
    const instances = b.instances.map(pickStyleInstance).filter(Boolean).slice(0, 2);
    if (instances.length) return { instances };
  }

  const single = pickStyleInstance(b);
  if (single) return { instances: [single] };
  return null;
}

function quoteAllowedByTranscript(quote, transcript = []) {
  const q = (quote || '').trim();
  if (!q) return false;
  const turns = userTurns(transcript);
  if (!turns.length) return true;
  const normalizedQuote = q.toLowerCase();
  return turns.some((m) => {
    const content = m.content.toLowerCase();
    return content.includes(normalizedQuote) || normalizedQuote.includes(content);
  });
}

export function styleNotesFromTranscript(transcript, styles) {
  const myTurns = (transcript || []).filter((m) => m.role === 'me');
  const out = {};

  for (const key of STYLE_KEYS) {
    const matcher = STYLE_MATCHERS[key];
    const pct = styles[key];
    const matches = myTurns.filter((m) => matcher.test(m.content));

    if (matches.length > 0) {
      out[key] = {
        instances: matches.slice(0, 2).map((m) => ({
          quote: m.content,
          why: HIGH_STYLE_WHY[key](),
        })),
      };
      continue;
    }

    if (pct < 20 && myTurns.length > 0) {
      const counter =
        myTurns.find((m) => !matcher.test(m.content) && STYLE_MATCHERS.assertive.test(m.content)) ||
        myTurns.find((m) => !matcher.test(m.content) && m.content.length > 12);
      if (counter) {
        out[key] = {
          instances: [
            {
              quote: counter.content,
              why: LOW_STYLE_WHY[key](counter.content),
            },
          ],
        };
        continue;
      }
    }

    if (myTurns.length > 0 && pct >= 20) {
      const m = myTurns[Math.min(1, myTurns.length - 1)];
      out[key] = {
        instances: [
          {
            quote: m.content,
            why: `This line contributed to your ${pct}% ${key.replace('_', '-')} score in this session.`,
          },
        ],
      };
      continue;
    }

    out[key] = { instances: [] };
  }

  return out;
}

export function normalizeStyleNotes(raw, styles, transcript = []) {
  const fromTranscript = styleNotesFromTranscript(transcript, styles);
  const out = {};
  for (const key of STYLE_KEYS) {
    const picked = pickStyleNote(raw, key);
    if (picked) {
      picked.instances = picked.instances.filter((inst) => quoteAllowedByTranscript(inst.quote, transcript));
    }
    out[key] = picked?.instances?.length ? picked : fromTranscript[key] || { instances: [] };
  }
  return out;
}

function pickBlock(raw, key, transcript = []) {
  const b = raw[key];
  if (!b || typeof b !== 'object') return null;
  const quote = (b.quote || '').trim();
  if (!quote) return null;
  if (!quoteAllowedByTranscript(quote, transcript)) return null;
  return {
    quote,
    why: humanizeInsightText(b.why || b.explanation || ''),
    instead: humanizeInsightText(b.instead || b.alternative || ''),
  };
}

function pickDidWellInstance(item) {
  if (!item || typeof item !== 'object') return null;
  const quote = (item.quote || '').trim();
  if (!quote) return null;
  const why = humanizeInsightText(item.why || item.reason || item.explanation || '');
  return {
    quote,
    why: why || 'This came across positively in your session.',
  };
}

function pickDidWell(raw, transcript = []) {
  const b = raw.did_well || raw.went_well;
  if (!b || typeof b !== 'object') return null;

  if (Array.isArray(b.instances)) {
    const instances = b.instances
      .map(pickDidWellInstance)
      .filter(
        (i) =>
          i &&
          quoteAllowedByTranscript(i.quote, transcript) &&
          !GENERIC_DID_WELL_RE.test(`${i.quote} ${i.why}`)
      );
    if (instances.length) return { instances };
  }

  const single = pickDidWellInstance(b);
  if (
    single &&
    quoteAllowedByTranscript(single.quote, transcript) &&
    !GENERIC_DID_WELL_RE.test(`${single.quote} ${single.why}`)
  ) {
    return { instances: [single] };
  }
  return null;
}

function transcriptDidWell(transcript = []) {
  const turns = userTurns(transcript);
  if (!turns.length) return null;
  const scored = turns
    .map((m, index) => {
      let score = 0;
      if (/\bi feel\b|\bi felt\b/i.test(m.content)) score += 4;
      if (/\bi need\b|\bi want\b|\bi'd like\b|\bi would like\b/i.test(m.content)) score += 4;
      if (/\bwhen you\b|\bbecause\b|\bit affected\b|\bit makes me\b/i.test(m.content)) score += 3;
      if (!STYLE_MATCHERS.aggressive.test(m.content)) score += 1;
      if (m.content.length > 35) score += 1;
      return { ...m, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = scored.slice(0, 2);
  return {
    instances: picked.map((m) => {
      let why = 'You gave the conversation something concrete to work with.';
      if (/\bi feel\b|\bi felt\b/i.test(m.content)) {
        why = 'You named your feeling instead of only describing what the other person did.';
      } else if (/\bi need\b|\bi want\b|\bi'd like\b|\bi would like\b/i.test(m.content)) {
        why = 'You moved toward a clear request, which makes the real conversation easier to act on.';
      } else if (/\bwhen you\b|\bbecause\b/i.test(m.content)) {
        why = 'You connected the issue to a specific moment or impact.';
      }
      return { quote: truncate(m.content, 160), why };
    }),
  };
}

function didWellBlock(raw, transcript = []) {
  const picked = pickDidWell(raw, transcript);
  if (picked) {
    return { type: 'did_well', ...picked };
  }
  const fromTranscript = transcriptDidWell(transcript);
  if (fromTranscript) {
    return { type: 'did_well', ...fromTranscript };
  }
  return {
    type: 'did_well',
    instances: [
      {
        quote: 'Your effort in this session',
        why: 'You showed up and worked through a difficult conversation, which is a real step forward.',
      },
    ],
  };
}

function pointerItem(item) {
  if (!item || typeof item !== 'object') return null;
  const text = humanizeInsightText(item.text || item.tip || item.pointer || item.why || '');
  if (!text) return null;
  return { text };
}

function phraseOption(item, fallbackLabel) {
  if (!item || typeof item !== 'object') return null;
  const text = humanizeInsightText(item.text || item.phrase || item.version || item.say || '');
  if (!text) return null;
  return {
    label: (item.label || item.tone || fallbackLabel || '').trim(),
    text,
  };
}

export function normalizeCoachPointers(raw = {}, coachTranscript = [], situation = '') {
  const source = raw.coach_pointers || raw.coachPointers || raw.pointers || {};
  const tips = Array.isArray(source.tips)
    ? source.tips.map(pointerItem).filter(Boolean).slice(0, 3)
    : [];
  const phraseOptions = Array.isArray(source.phrase_options || source.phraseOptions)
    ? (source.phrase_options || source.phraseOptions)
        .map((item, index) => phraseOption(item, index === 0 ? 'Softer' : 'Clearer'))
        .filter(Boolean)
        .slice(0, 2)
    : [];

  if (tips.length || phraseOptions.length) {
    return { tips, phraseOptions };
  }

  const coachTurns = userTurns(coachTranscript);
  if (!coachTurns.length && !situation.trim()) {
    return { tips: [], phraseOptions: [] };
  }

  const basis = truncate(
    coachTurns.find((m) => /\b(feel|need|want|frustrated|upset|hurt|because)\b/i.test(m.content))?.content ||
      coachTurns[0]?.content ||
      situation,
    140
  );

  return {
    tips: [
      {
        text: 'Turn the advice-seeking parts of the session into one clear feeling, one specific moment, and one request.',
      },
      {
        text: 'Keep the real conversation focused on what you want to change next, not on proving the whole history of the problem.',
      },
    ],
    phraseOptions: [
      {
        label: 'Softer',
        text: `I wanted to talk about ${basis}. I know this might not have been your intention, but it has been affecting me, and I would like us to find a better way forward.`,
      },
      {
        label: 'More direct',
        text: `I need to talk about ${basis}. When this happens, it affects me, and I need something to change going forward.`,
      },
    ],
  };
}

export function toShortTitle(text, maxWords = 5) {
  const words = (text || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?,;:]+$/, '')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function pickIssueTitle(raw, situation, transcript = []) {
  const fromAi = (raw.issue_title || '').trim();
  if (fromAi) return toShortTitle(fromAi, 6);
  const sit = (situation || '').trim();
  if (sit) return toShortTitle(sit, 6);
  const quote = pickBestUserQuote(transcript);
  if (quote) return toShortTitle(quote, 6);
  return 'Conversation';
}

function pickIssueSummary(raw, situation, transcript = []) {
  let fromAi = (raw.issue_summary || '').trim();
  if (fromAi) return humanizeInsightText(fromAi);
  const sit = (situation || '').trim();
  if (!sit) {
    const quote = pickBestUserQuote(transcript);
    if (quote) return `You practiced how to say: “${quote}”`;
    return 'You used this rehearsal to prepare for a difficult conversation.';
  }
  const sentence = sit.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || sit;
  return sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence;
}

export function normalizeInsights(raw, transcript = [], situation = '') {
  const styles = normalizeStyles(raw);
  const styleNotes = normalizeStyleNotes(raw, styles, transcript);
  const coachPointers = normalizeCoachPointers(raw, raw.coachTranscript || [], situation);
  const issueTitle = pickIssueTitle(raw, situation, transcript);
  const issueSummary = pickIssueSummary(raw, situation, transcript);
  const horsemen = HORSEMAN_KEYS.map((key) => ({ key, block: pickBlock(raw, key, transcript) })).filter(
    (x) => x.block
  );

  const horsemanBlocks = horsemen
    .map(({ key, block }) => ({ type: key, ...block }))
    .slice(0, 3);
  const didWell = didWellBlock(raw, transcript);
  if (Array.isArray(didWell.instances)) {
    didWell.instances = didWell.instances.slice(0, 2);
  }
  const blocks = [...horsemanBlocks, didWell];

  return { styles, styleNotes, coachPointers, blocks, issueTitle, issueSummary };
}
