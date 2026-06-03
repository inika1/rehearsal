export const STYLE_METERS = [
  { key: 'passive', label: 'Passive', color: '#8a9ab0' },
  { key: 'aggressive', label: 'Aggressive', color: '#e54d4d' },
  { key: 'passive_aggressive', label: 'Passive-aggressive', color: '#e8a23d' },
  { key: 'assertive', label: 'Assertive', color: '#6bc48a' },
];

export const BLOCK_META = {
  critical: { title: 'Critical', color: '#e54d4d' },
  contemptuous: { title: 'Contemptuous', color: '#c45c8a' },
  defensive: { title: 'Defensive', color: '#e8a23d' },
  stonewalling: { title: 'Stonewalling', color: '#7a9eb8' },
  good: { title: 'Well done', color: '#6bc48a' },
};

const DEFAULT_GOOD =
  'This conversation went well. You stayed constructive and you’re ready for the real thing.';

export function assertiveColor(v) {
  if (v >= 60) return '#6bc48a';
  if (v >= 40) return '#c4a96e';
  return '#e8a23d';
}

export function resolveInsights(conv) {
  const styles = {
    passive: conv.passive ?? 25,
    aggressive: conv.aggressive ?? 25,
    passive_aggressive: conv.passive_aggressive ?? 25,
    assertive: conv.assertive ?? conv.tension ?? 25,
  };

  let blocks = conv.insights;
  if (typeof blocks === 'string') {
    try {
      blocks = JSON.parse(blocks);
    } catch {
      blocks = null;
    }
  }

  if (Array.isArray(blocks) && blocks.length > 0) {
    return { styles, blocks };
  }

  if (conv.insight_tend || conv.insight_try || conv.insight_used) {
    return {
      styles: {
        passive: conv.tension ?? 30,
        aggressive: 100 - (conv.emotion ?? 50),
        passive_aggressive: 20,
        assertive: conv.emotion ?? 50,
      },
      blocks: [
        { type: 'legacy', tend: conv.insight_tend, try: conv.insight_try, used: conv.insight_used },
      ],
    };
  }

  return { styles, blocks: [{ type: 'good', message: DEFAULT_GOOD }] };
}
