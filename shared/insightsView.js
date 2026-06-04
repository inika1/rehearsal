// Style definitions adapted from SCCR:
// https://www.scottishconflictresolution.org.uk/learning-zone-communication-styles

export const STYLES_INTRO =
  'How your messages in this rehearsal blended four communication styles (percentages total 100%). Most people mix styles across a conversation.';

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
      quote: 'Your effort in this rehearsal',
      why: 'You showed up and practised having a difficult conversation, which is a real step forward.',
    },
  ],
};

export function normalizeStyleNote(note) {
  if (!note) return { instances: [] };
  if (Array.isArray(note.instances) && note.instances.length) {
    return {
      instances: note.instances
        .filter((i) => i?.quote)
        .slice(0, 2)
        .map((i) => ({
          quote: i.quote,
          why: i.why || i.reason || '',
        })),
    };
  }
  const quote = (note.example || note.quote || '').trim();
  if (quote) {
    return {
      instances: [
        {
          quote,
          why: (note.why || note.reason || '').trim(),
        },
      ].filter((i) => i.quote),
    };
  }
  return { instances: [] };
}

export function normalizeDidWellBlock(block) {
  if (!block || (block.type !== 'did_well' && block.type !== 'went_well')) return block;
  if (Array.isArray(block.instances) && block.instances.length) {
    return { type: 'did_well', instances: block.instances };
  }
  if (block.quote) {
    return {
      type: 'did_well',
      instances: [{ quote: block.quote, why: block.why || '' }],
    };
  }
  return DEFAULT_DID_WELL;
}

function finalizeBlocks(blocks) {
  const horseman = blocks.filter(
    (b) => b.type !== 'good' && b.type !== 'did_well' && b.type !== 'went_well'
  );
  let didWell = blocks.find((b) => b.type === 'did_well' || b.type === 'went_well');
  didWell = normalizeDidWellBlock(didWell);
  return [...horseman, didWell || DEFAULT_DID_WELL];
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
    return { blocks: payload.blocks, styleNotes: payload.style_notes || null };
  }
  if (Array.isArray(payload) && payload.length > 0) {
    return { blocks: payload, styleNotes: null };
  }
  return { blocks: null, styleNotes: null };
}

export function resolveInsights(conv) {
  const styles = {
    passive: conv.passive ?? 25,
    aggressive: conv.aggressive ?? 25,
    passive_aggressive: conv.passive_aggressive ?? 25,
    assertive: conv.assertive ?? conv.tension ?? 25,
  };

  const { blocks: parsedBlocks, styleNotes: parsedNotes } = parseInsightsField(conv);

  const styleNotes = {};
  for (const m of STYLE_METERS) {
    const raw = parsedNotes?.[m.key];
    styleNotes[m.key] = normalizeStyleNote(raw);
  }

  if (parsedBlocks) {
    return { styles, blocks: finalizeBlocks(parsedBlocks), styleNotes };
  }

  if (conv.insight_tend || conv.insight_try || conv.insight_used) {
    const legacyStyles = {
      passive: conv.tension ?? 30,
      aggressive: 100 - (conv.emotion ?? 50),
      passive_aggressive: 20,
      assertive: conv.emotion ?? 50,
    };
    return {
      styles: legacyStyles,
      blocks: finalizeBlocks([
        { type: 'legacy', tend: conv.insight_tend, try: conv.insight_try, used: conv.insight_used },
      ]),
      styleNotes,
    };
  }

  return {
    styles,
    blocks: [DEFAULT_DID_WELL],
    styleNotes,
  };
}
