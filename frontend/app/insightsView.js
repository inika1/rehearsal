// Style definitions adapted from SCCR:
// https://www.scottishconflictresolution.org.uk/learning-zone-communication-styles

export const STYLES_INTRO = 'Your communication style mix this session (tap a slice for examples).';

export const HORSEMAN_TYPES = new Set(['critical', 'contemptuous', 'defensive', 'stonewalling']);

export const STYLE_METERS = [
  {
    key: 'passive',
    label: 'Passive',
    color: '#8a9ab0',
    description:
      'Avoids confrontation and often accommodates others, sometimes without saying what you actually need.',
  },
  {
    key: 'aggressive',
    label: 'Aggressive',
    color: '#e54d4d',
    description:
      'Prioritises winning or control and can override others’ feelings, which often raises defensiveness.',
  },
  {
    key: 'passive_aggressive',
    label: 'Passive-aggressive',
    color: '#e8a23d',
    description:
      'Sounds agreeable on the surface but frustration shows indirectly—sarcasm, avoidance, or subtle pushback.',
  },
  {
    key: 'assertive',
    label: 'Assertive',
    color: '#6bc48a',
    description:
      'Balances clarity and respect—states your feelings and needs while staying open to the other person.',
  },
];

export const BLOCK_META = {
  critical: { title: 'Critical', color: '#e54d4d' },
  contemptuous: { title: 'Contemptuous', color: '#c45c8a' },
  defensive: { title: 'Defensive', color: '#e8a23d' },
  stonewalling: { title: 'Stonewalling', color: '#7a9eb8' },
  did_well: { title: 'What you did well', color: '#6bc48a' },
  went_well: { title: 'What you did well', color: '#6bc48a' },
};

const DEFAULT_DID_WELL = {
  type: 'did_well',
  instances: [
    {
      quote: 'Your effort in this session',
      why: 'You showed up and worked through a difficult conversation, which is a real step forward.',
    },
  ],
};

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

export function formatQuote(text, max = 140) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function normalizeStyleNote(note) {
  if (!note) return { instances: [] };
  if (Array.isArray(note.instances) && note.instances.length) {
    return {
      instances: note.instances
        .filter((i) => i?.quote)
        .slice(0, 2)
        .map((i) => ({
          quote: formatQuote(i.quote, 160),
          why: (i.why || i.reason || '').trim(),
        })),
    };
  }
  const quote = (note.example || note.quote || '').trim();
  if (quote) {
    return {
      instances: [
        {
          quote: formatQuote(quote, 160),
          why: (note.why || note.reason || '').trim(),
        },
      ],
    };
  }
  return { instances: [] };
}

export function normalizeDidWellBlock(block) {
  if (!block || (block.type !== 'did_well' && block.type !== 'went_well')) return block;
  let instances = [];
  if (Array.isArray(block.instances) && block.instances.length) {
    instances = block.instances;
  } else if (block.quote) {
    instances = [{ quote: block.quote, why: block.why || '' }];
  }
  instances = instances
    .filter((i) => i?.quote)
    .slice(0, 2)
    .map((i) => ({
      quote: formatQuote(i.quote, 160),
      why: (i.why || '').trim(),
    }));
  if (!instances.length) return DEFAULT_DID_WELL;
  return { type: 'did_well', instances };
}

function normalizeHorsemanBlock(block) {
  if (!block || !HORSEMAN_TYPES.has(block.type)) return null;
  const quote = (block.quote || '').trim();
  if (!quote) return null;
  return {
    type: block.type,
    quote: formatQuote(quote, 160),
    why: (block.why || '').trim(),
    instead: block.instead ? formatQuote(block.instead, 160) : '',
  };
}

export function finalizeBlocks(blocks) {
  const horseman = blocks
    .map(normalizeHorsemanBlock)
    .filter(Boolean)
    .slice(0, 3);
  const didWell = normalizeDidWellBlock(
    blocks.find((b) => b.type === 'did_well' || b.type === 'went_well')
  );
  return { horseman, didWell: didWell || DEFAULT_DID_WELL };
}

export function toShortTitle(text, maxWords = 6) {
  const words = (text || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?,;:]+$/, '')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function normalizeSummaryText(summary) {
  return (summary || '')
    .trim()
    .replace(/^The user is trying to work through a situation where they /i, "You're ")
    .replace(/^The user feels /i, 'You feel ')
    .replace(/^The user /i, 'You ');
}

export function displayHeadline(conv) {
  const title = (conv.title || '').trim();
  if (title && title.toLowerCase() !== 'untitled') return title;
  const fromInsights = shortTitleFromInsights(conv);
  if (fromInsights) return fromInsights;
  const summary = normalizeSummaryText(conv.issue_summary);
  if (summary) return toShortTitle(summary, 6);
  const situation = (conv.situation || '').trim();
  if (situation) return toShortTitle(situation, 6);
  return 'Conversation';
}

export function displayIssueSummary(conv) {
  const headline = displayHeadline(conv);
  let summary = normalizeSummaryText(conv.issue_summary);
  if (summary) {
    if (toShortTitle(summary, 6) === headline) return null;
    return summary.length > 180 ? `${summary.slice(0, 177)}…` : summary;
  }
  const situation = (conv.situation || '').trim();
  if (!situation) return null;
  if (toShortTitle(situation, 6) === headline) return null;
  const sentence = situation.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || situation;
  if (toShortTitle(sentence, 6) === headline) return null;
  return sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence;
}

export function assertiveColor(v) {
  if (v >= 60) return '#6bc48a';
  if (v >= 40) return '#c4a96e';
  return '#e8a23d';
}

function parseInsightsField(conv) {
  let payload = conv.insights;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  if (payload && Array.isArray(payload.blocks)) {
    return {
      blocks: payload.blocks,
      styleNotes: payload.style_notes || null,
    };
  }
  if (Array.isArray(payload) && payload.length > 0) {
    return { blocks: payload, styleNotes: null };
  }
  return { blocks: null, styleNotes: null };
}

function shortTitleFromInsights(conv) {
  let payload = conv.insights;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  const t = payload?.issue_title?.trim();
  return t ? toShortTitle(t, 6) : null;
}

export function resolveInsights(conv) {
  const styles = normalizeStyles({
    passive: conv.passive,
    aggressive: conv.aggressive,
    passive_aggressive: conv.passive_aggressive,
    assertive: conv.assertive ?? conv.tension,
  });

  const { blocks: parsedBlocks, styleNotes: parsedNotes } = parseInsightsField(conv);

  const styleNotes = {};
  for (const m of STYLE_METERS) {
    styleNotes[m.key] = normalizeStyleNote(parsedNotes?.[m.key]);
  }

  if (parsedBlocks) {
    const { horseman, didWell } = finalizeBlocks(parsedBlocks);
    return { styles, horseman, didWell, styleNotes };
  }

  if (conv.insight_tend || conv.insight_try || conv.insight_used) {
    return {
      styles: normalizeStyles({
        passive: conv.tension ?? 30,
        aggressive: 100 - (conv.emotion ?? 50),
        passive_aggressive: 20,
        assertive: conv.emotion ?? 50,
      }),
      horseman: [],
      didWell: DEFAULT_DID_WELL,
      styleNotes,
      legacy: {
        tend: conv.insight_tend,
        try: conv.insight_try,
        used: conv.insight_used,
      },
    };
  }

  return {
    styles,
    horseman: [],
    didWell: DEFAULT_DID_WELL,
    styleNotes,
  };
}
