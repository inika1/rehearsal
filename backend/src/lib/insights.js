const HORSEMAN_KEYS = ['critical', 'contemptuous', 'defensive', 'stonewalling'];
const STYLE_KEYS = ['passive', 'aggressive', 'passive_aggressive', 'assertive'];

const STYLE_MATCHERS = {
  passive: /\b(sorry|just|maybe|kind of|i guess|no rush|it's fine|whatever you want|if that's ok)\b/i,
  aggressive: /\b(always|never|you always|you never|ridiculous|stupid|get over it|your fault)\b/i,
  passive_aggressive: /\b(fine|whatever|sure)\b.*\b(but|though|guess)\b|\bnot mad\b|\bi'm fine\b/i,
  assertive: /\b(i feel|i felt|i need|i'd like|i would like|when you|because)\b/i,
};

const LOW_STYLE_WHY = {
  passive: (q) => `Saying “${truncate(q)}” is direct—you state your point without backing away.`,
  aggressive: (q) => `“${truncate(q)}” focuses on your experience rather than attacking them.`,
  passive_aggressive: (q) => `“${truncate(q)}” is straightforward rather than indirect or sarcastic.`,
  assertive: (q) => `“${truncate(q)}” is more tentative or accommodating than a full I-statement.`,
};

const HIGH_STYLE_WHY = {
  passive: () => 'Softening or avoiding conflict shows up here.',
  aggressive: () => 'Forceful or win-focused language shows up here.',
  passive_aggressive: () => 'Agreeing on the surface while pushing back indirectly shows up here.',
  assertive: () => 'Clear feelings, impact, and needs show up here.',
};

function truncate(s, n = 48) {
  const t = (s || '').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
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
  const why = (item.why || item.reason || '').trim();
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
            why: `This line contributed to your ${pct}% ${key.replace('_', '-')} score in this rehearsal.`,
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
    out[key] = pickStyleNote(raw, key) || fromTranscript[key] || { instances: [] };
  }
  return out;
}

function pickBlock(raw, key) {
  const b = raw[key];
  if (!b || typeof b !== 'object') return null;
  const quote = (b.quote || '').trim();
  if (!quote) return null;
  return {
    quote,
    why: (b.why || b.explanation || '').trim(),
    instead: (b.instead || b.alternative || '').trim(),
  };
}

function pickDidWellInstance(item) {
  if (!item || typeof item !== 'object') return null;
  const quote = (item.quote || '').trim();
  if (!quote) return null;
  const why = (item.why || item.reason || item.explanation || '').trim();
  return {
    quote,
    why: why || 'This came across positively in your rehearsal.',
  };
}

function pickDidWell(raw) {
  const b = raw.did_well || raw.went_well;
  if (!b || typeof b !== 'object') return null;

  if (Array.isArray(b.instances)) {
    const instances = b.instances.map(pickDidWellInstance).filter(Boolean);
    if (instances.length) return { instances };
  }

  const single = pickDidWellInstance(b);
  if (single) return { instances: [single] };
  return null;
}

function didWellBlock(raw) {
  const picked = pickDidWell(raw);
  if (picked) {
    return { type: 'did_well', ...picked };
  }
  return {
    type: 'did_well',
    instances: [
      {
        quote: 'Your effort in this rehearsal',
        why: 'You showed up and practised having a difficult conversation, which is a real step forward.',
      },
    ],
  };
}

export function normalizeInsights(raw, transcript = []) {
  const styles = normalizeStyles(raw);
  const styleNotes = normalizeStyleNotes(raw, styles, transcript);
  const horsemen = HORSEMAN_KEYS.map((key) => ({ key, block: pickBlock(raw, key) })).filter(
    (x) => x.block
  );

  const blocks = [
    ...horsemen.map(({ key, block }) => ({ type: key, ...block })),
    didWellBlock(raw),
  ];

  return { styles, styleNotes, blocks };
}
