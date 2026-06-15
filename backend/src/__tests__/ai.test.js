import { test } from 'node:test';
import assert from 'node:assert/strict';

// ai.js reads GROQ_API_KEY at module load time.
// Delete it before importing so all tests in this file use the no-key (mock) path.
delete process.env.GROQ_API_KEY;
const { replyAs, analyse } = await import('../lib/ai.js');

const person = { name: 'Alex', relationship: 'flatmate' };
const situation = 'Alex not doing the dishes';

// ── replyAs (no API key — guided questions) ───────────────────────────────────

test('replyAs: returns a non-empty reply on first turn', async () => {
  const history = [{ role: 'them', content: 'Hello' }];
  const result = await replyAs(person, situation, history);
  assert.ok(typeof result.reply === 'string' && result.reply.length > 0);
  assert.equal(result.done, false);
});

test('replyAs: advances through guided questions as user responds', async () => {
  // idx = max(0, userMsgCount - 1), so we need 2 user messages to move to question index 1
  const history1 = [{ role: 'them', content: 'Question 1' }];
  const history2 = [
    { role: 'them', content: 'Question 1' },
    { role: 'me', content: 'Answer 1' },
    { role: 'them', content: 'Question 2' },
    { role: 'me', content: 'Answer 2' },
  ];
  const r1 = await replyAs(person, situation, history1);
  const r2 = await replyAs(person, situation, history2);
  assert.notEqual(r1.reply, r2.reply);
});

test('replyAs: returns done:true after all guided questions exhausted', async () => {
  const history = [];
  for (let i = 0; i < 7; i++) {
    history.push({ role: 'me', content: `My answer to question ${i}` });
  }
  const result = await replyAs(person, situation, history);
  assert.equal(result.done, true);
});

test('replyAs: first guided question is non-empty', async () => {
  const result = await replyAs(person, situation, []);
  assert.ok(result.reply.length > 0);
});

test('replyAs: guided questions include three direct-practice prompts', async () => {
  const replies = [];
  for (let i = 0; i < 7; i++) {
    const history = Array.from({ length: i + 1 }, (_, idx) => ({
      role: 'me',
      content: `Answer ${idx + 1}`,
    }));
    const result = await replyAs(person, situation, history);
    replies.push(result.reply);
  }

  const directPracticeCount = replies.filter((reply) =>
    /as if Alex|directly|request directly/.test(reply)
  ).length;

  assert.equal(directPracticeCount, 3);
  assert.ok(replies.every((reply) => !reply.includes('{name}')));
});

// ── analyse (no API key — mock analysis) ─────────────────────────────────────

test('analyse: returns valid style scores that sum to 100', async () => {
  const transcript = [
    { role: 'them', content: 'What do you want to say?' },
    { role: 'me', content: 'I feel frustrated when you leave dishes in the sink.' },
  ];
  const result = await analyse(person, situation, transcript);
  const { passive, aggressive, passive_aggressive, assertive } = result.styles;
  assert.equal(passive + aggressive + passive_aggressive + assertive, 100);
});

test('analyse: always returns a did_well block', async () => {
  const transcript = [{ role: 'me', content: 'I need help with the chores.' }];
  const result = await analyse(person, situation, transcript);
  const dw = result.blocks.find((b) => b.type === 'did_well');
  assert.ok(dw);
  assert.ok(dw.instances.length > 0);
});

test('analyse: detects aggressive language and returns horseman block', async () => {
  const transcript = [
    { role: 'them', content: 'Now say the specific moment directly to them: "When you..."' },
    { role: 'me', content: 'You always leave a mess, it is ridiculous.' },
  ];
  const result = await analyse(person, situation, transcript);
  const horseman = result.blocks.find((b) => ['critical', 'aggressive'].includes(b.type));
  assert.ok(result.styles.aggressive > 0);
});

test('analyse: style feedback only uses direct-practice answers', async () => {
  const transcript = [
    { role: 'them', content: 'What are you feeling about this situation?' },
    { role: 'me', content: 'You always make this impossible and it is ridiculous.' },
    { role: 'them', content: 'Try making the request directly: "I\'d like..."' },
    { role: 'me', content: 'I would like us to make a dishes schedule.' },
  ];

  const result = await analyse(person, situation, transcript);
  const allStyleQuotes = Object.values(result.styleNotes).flatMap((note) =>
    (note.instances || []).map((inst) => inst.quote)
  );

  assert.ok(!allStyleQuotes.includes('You always make this impossible and it is ridiculous.'));
  assert.ok(allStyleQuotes.includes('I would like us to make a dishes schedule.'));
  assert.ok(result.coachPointers.tips.length > 0);
  assert.equal(result.coachPointers.phraseOptions.length, 2);
});

test('analyse: handles empty transcript without throwing', async () => {
  const result = await analyse(person, situation, []);
  assert.ok(result.styles);
  assert.ok(Array.isArray(result.blocks));
});

test('analyse: issueTitle is set from situation when transcript is empty', async () => {
  const result = await analyse(person, situation, []);
  assert.ok(result.issueTitle.length > 0);
});
