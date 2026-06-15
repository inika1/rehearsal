import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStyles,
  normalizeInsights,
  splitTranscriptByPrompt,
  toShortTitle,
  styleNotesFromTranscript,
  humanizeInsightText,
} from '../lib/insights.js';

// ── normalizeStyles ───────────────────────────────────────────────────────────

test('normalizeStyles: exact values pass through unchanged', () => {
  const r = normalizeStyles({ passive: 25, aggressive: 25, passive_aggressive: 25, assertive: 25 });
  assert.equal(r.passive + r.aggressive + r.passive_aggressive + r.assertive, 100);
});

test('normalizeStyles: rescales values that do not sum to 100', () => {
  const r = normalizeStyles({ passive: 60, aggressive: 60, passive_aggressive: 60, assertive: 60 });
  assert.equal(r.passive + r.aggressive + r.passive_aggressive + r.assertive, 100);
});

test('normalizeStyles: all zeros returns equal 25/25/25/25', () => {
  assert.deepEqual(
    normalizeStyles({ passive: 0, aggressive: 0, passive_aggressive: 0, assertive: 0 }),
    { passive: 25, aggressive: 25, passive_aggressive: 25, assertive: 25 }
  );
});

test('normalizeStyles: clamps negative values', () => {
  const r = normalizeStyles({ passive: -20, aggressive: 50, passive_aggressive: 50, assertive: 50 });
  assert.ok(r.passive >= 0);
  assert.equal(r.passive + r.aggressive + r.passive_aggressive + r.assertive, 100);
});

test('normalizeStyles: clamps values over 100', () => {
  const r = normalizeStyles({ passive: 200, aggressive: 0, passive_aggressive: 0, assertive: 0 });
  assert.ok(r.passive <= 100);
});

// ── toShortTitle ──────────────────────────────────────────────────────────────

test('toShortTitle: trims to max words', () => {
  assert.equal(toShortTitle('one two three four five six', 5), 'one two three four five');
});

test('toShortTitle: strips trailing period', () => {
  assert.equal(toShortTitle('Kieran not doing dishes.', 6), 'Kieran not doing dishes');
});

test('toShortTitle: strips surrounding quotes', () => {
  assert.equal(toShortTitle('"something important"', 5), 'something important');
});

test('toShortTitle: handles empty string', () => {
  assert.equal(toShortTitle('', 5), '');
});

test('toShortTitle: handles null/undefined gracefully', () => {
  assert.equal(toShortTitle(null, 5), '');
});

// ── normalizeInsights ─────────────────────────────────────────────────────────

test('normalizeInsights: styles always sum to 100', () => {
  const { styles } = normalizeInsights({ passive: 10, aggressive: 20, passive_aggressive: 30, assertive: 40 });
  assert.equal(styles.passive + styles.aggressive + styles.passive_aggressive + styles.assertive, 100);
});

test('normalizeInsights: always produces a did_well block with at least one instance', () => {
  const { blocks } = normalizeInsights({});
  const dw = blocks.find((b) => b.type === 'did_well');
  assert.ok(dw, 'did_well block missing');
  assert.ok(dw.instances.length > 0);
});

test('normalizeInsights: includes horseman block when quote is present', () => {
  const raw = {
    passive: 20, aggressive: 30, passive_aggressive: 10, assertive: 40,
    critical: { quote: 'You always leave a mess', why: 'Generalisation', instead: 'Last Tuesday you...' },
  };
  const { blocks } = normalizeInsights(raw);
  const critical = blocks.find((b) => b.type === 'critical');
  assert.ok(critical);
  assert.equal(critical.quote, 'You always leave a mess');
  assert.equal(critical.instead, 'Last Tuesday you...');
});

test('normalizeInsights: ignores horseman block when quote is empty', () => {
  const raw = {
    passive: 25, aggressive: 25, passive_aggressive: 25, assertive: 25,
    critical: { quote: '', why: 'something', instead: 'something else' },
  };
  const { blocks } = normalizeInsights(raw);
  assert.equal(blocks.find((b) => b.type === 'critical'), undefined);
});

test('normalizeInsights: issueTitle uses AI value when present', () => {
  const { issueTitle } = normalizeInsights({ issue_title: 'Kieran bins not taken out' }, [], '');
  assert.equal(issueTitle, 'Kieran bins not taken out');
});

test('normalizeInsights: issueTitle falls back to situation', () => {
  const { issueTitle } = normalizeInsights({}, [], 'Flatmate leaving dishes in the sink');
  assert.equal(issueTitle, 'Flatmate leaving dishes in the sink');
});

test('normalizeInsights: issueTitle falls back to Conversation when nothing provided', () => {
  const { issueTitle } = normalizeInsights({});
  assert.equal(issueTitle, 'Conversation');
});

test('normalizeInsights: issueTitle can fall back to transcript when situation is empty', () => {
  const transcript = [
    { role: 'me', content: 'I feel ignored when plans change without telling me.' },
  ];
  const { issueTitle } = normalizeInsights({}, transcript, '');
  assert.equal(issueTitle, 'I feel ignored when plans change');
});

test('normalizeInsights: issueSummary strips "The user" prefix', () => {
  const { issueSummary } = normalizeInsights({ issue_summary: 'The user feels ignored at home.' });
  assert.ok(!issueSummary.startsWith('The user'));
  assert.equal(issueSummary, 'You feel ignored at home.');
});

test('normalizeInsights: issueSummary can fall back to transcript when situation is empty', () => {
  const transcript = [
    { role: 'me', content: 'I need us to talk before changing plans.' },
  ];
  const { issueSummary } = normalizeInsights({}, transcript, '');
  assert.equal(issueSummary, 'You practiced how to say: “I need us to talk before changing plans.”');
});

test('normalizeInsights: replaces generic did_well with transcript-specific moments', () => {
  const transcript = [
    { role: 'me', content: 'I feel frustrated when you cancel at the last minute.' },
    { role: 'me', content: 'I would like more notice next time.' },
  ];
  const { blocks } = normalizeInsights({
    did_well: {
      instances: [
        {
          quote: 'Your messages in this rehearsal',
          why: 'You stayed constructive overall and are building readiness for the real conversation.',
        },
      ],
    },
  }, transcript, '');
  const dw = blocks.find((b) => b.type === 'did_well');
  assert.equal(dw.instances.length, 2);
  assert.equal(dw.instances[0].quote, 'I feel frustrated when you cancel at the last minute.');
  assert.ok(!dw.instances[0].why.includes('constructive overall'));
});

test('humanizeInsightText: rewrites style-note phrasing', () => {
  assert.equal(
    humanizeInsightText('This line shows the user is being passive-aggressive.'),
    'This shows you being passive-aggressive.'
  );
  assert.equal(
    humanizeInsightText("This shows the user's communication was defensive."),
    'This shows your communication was defensive.'
  );
  assert.equal(
    humanizeInsightText('The user could state their own needs more clearly.'),
    'You could state your own needs more clearly.'
  );
  assert.equal(
    humanizeInsightText('They felt ignored and backed away.'),
    'You felt ignored and backed away.'
  );
});

test('normalizeInsights: horseman why fields are second person', () => {
  const { blocks } = normalizeInsights({
    critical: {
      quote: 'You never listen',
      why: 'This line shows the user is attacking their character.',
      instead: 'The user could say how they feel instead.',
    },
  });
  const critical = blocks.find((b) => b.type === 'critical');
  assert.equal(critical.why, 'This shows you attacking their character.');
  assert.ok(!critical.instead.includes('user'));
});

test('normalizeInsights: multiple horsemen all appear in blocks', () => {
  const raw = {
    passive: 20, aggressive: 20, passive_aggressive: 20, assertive: 40,
    critical: { quote: 'You never listen', why: 'Generalisation', instead: 'Last time...' },
    contemptuous: { quote: 'You are such a child', why: 'Disrespect', instead: 'I feel dismissed...' },
  };
  const { blocks } = normalizeInsights(raw);
  assert.ok(blocks.find((b) => b.type === 'critical'));
  assert.ok(blocks.find((b) => b.type === 'contemptuous'));
});

// ── styleNotesFromTranscript ──────────────────────────────────────────────────

test('styleNotesFromTranscript: detects assertive language', () => {
  const transcript = [{ role: 'me', content: 'I feel hurt when you do that.' }];
  const styles = { passive: 10, aggressive: 10, passive_aggressive: 10, assertive: 70 };
  const notes = styleNotesFromTranscript(transcript, styles);
  assert.ok(notes.assertive?.instances?.length > 0);
  assert.equal(notes.assertive.instances[0].quote, 'I feel hurt when you do that.');
});

test('styleNotesFromTranscript: detects aggressive language', () => {
  const transcript = [{ role: 'me', content: 'You always do this, it is ridiculous.' }];
  const styles = { passive: 10, aggressive: 60, passive_aggressive: 10, assertive: 20 };
  const notes = styleNotesFromTranscript(transcript, styles);
  assert.ok(notes.aggressive?.instances?.length > 0);
});

test('styleNotesFromTranscript: ignores coach messages (role !== me)', () => {
  const transcript = [
    { role: 'them', content: 'I feel like you never listen.' },
    { role: 'me', content: 'I need more time together.' },
  ];
  const styles = { passive: 10, aggressive: 10, passive_aggressive: 10, assertive: 70 };
  const notes = styleNotesFromTranscript(transcript, styles);
  const allQuotes = Object.values(notes).flatMap((n) => (n?.instances || []).map((i) => i.quote));
  assert.ok(!allQuotes.includes('I feel like you never listen.'));
});

test('styleNotesFromTranscript: handles empty transcript', () => {
  const styles = { passive: 25, aggressive: 25, passive_aggressive: 25, assertive: 25 };
  const notes = styleNotesFromTranscript([], styles);
  for (const key of ['passive', 'aggressive', 'passive_aggressive', 'assertive']) {
    assert.ok(Array.isArray(notes[key]?.instances));
  }
});

test('splitTranscriptByPrompt: separates direct practice from coach context', () => {
  const transcript = [
    { role: 'them', content: 'What are you feeling about this situation?' },
    { role: 'me', content: 'I feel nervous and need advice.' },
    { role: 'them', content: 'Now say the specific moment directly to them: "When you..."' },
    { role: 'me', content: 'When you cancel last minute, I feel unimportant.' },
    { role: 'them', content: 'What would a good outcome look like?' },
    { role: 'me', content: 'I want us to make plans we can keep.' },
  ];

  const { directPractice, coachContext } = splitTranscriptByPrompt(transcript);

  assert.deepEqual(directPractice.map((m) => m.content), [
    'When you cancel last minute, I feel unimportant.',
  ]);
  assert.deepEqual(coachContext.map((m) => m.content), [
    'I feel nervous and need advice.',
    'I want us to make plans we can keep.',
  ]);
});
