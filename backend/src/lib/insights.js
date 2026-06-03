const HORSEMAN_KEYS = ['critical', 'contemptuous', 'defensive', 'stonewalling'];

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

export function normalizeInsights(raw) {
  const styles = normalizeStyles(raw);
  const horsemen = HORSEMAN_KEYS.map((key) => ({ key, block: pickBlock(raw, key) })).filter(
    (x) => x.block
  );

  if (horsemen.length > 0) {
    return {
      styles,
      blocks: horsemen.map(({ key, block }) => ({ type: key, ...block })),
    };
  }

  const message =
    (typeof raw.good_message === 'string' && raw.good_message.trim()) ||
    DEFAULT_GOOD_MESSAGE;
  return {
    styles,
    blocks: [{ type: 'good', message }],
  };
}

export const DEFAULT_GOOD_MESSAGE =
  'This conversation went well. You stayed constructive and you’re ready for the real thing.';
