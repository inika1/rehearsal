import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Set the key before importing so ai.js loads with API_KEY defined.
process.env.GROQ_API_KEY = 'test-key';
const { replyAs } = await import('../lib/ai.js');

const person = { name: 'Alex', relationship: 'flatmate' };
const situation = 'Alex not doing dishes';
const history = [
  { role: 'them', content: 'What do you want to say?' },
  { role: 'me', content: 'Hello' },
];

function mockFetch(responseText, status = 200) {
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content: responseText } }],
    }),
  });
}

let originalFetch;
before(() => { originalFetch = global.fetch; });
after(() => { global.fetch = originalFetch; });

// ── Happy path ────────────────────────────────────────────────────────────────

test('replyAs: parses valid JSON response from Groq', async () => {
  mockFetch('{"reply": "What are you feeling right now?", "done": false}');
  const result = await replyAs(person, situation, history);
  assert.equal(result.reply, 'What are you feeling right now?');
  assert.equal(result.done, false);
});

test('replyAs: parses done:true correctly', async () => {
  mockFetch('{"reply": "You are ready for this conversation.", "done": true}');
  const result = await replyAs(person, situation, history);
  assert.equal(result.done, true);
});

// ── Edge cases in Groq response ───────────────────────────────────────────────

test('replyAs: JSON wrapped in markdown code block still parses', async () => {
  mockFetch('```json\n{"reply": "Tell me more.", "done": false}\n```');
  const result = await replyAs(person, situation, history);
  assert.ok(result.reply.length > 0);
});

test('replyAs: empty reply field falls back to default message', async () => {
  mockFetch('{"reply": "", "done": false}');
  const result = await replyAs(person, situation, history);
  assert.ok(result.reply.length > 0, 'should not return empty reply');
});

test('replyAs: null reply field falls back to default message', async () => {
  mockFetch('{"reply": null, "done": false}');
  const result = await replyAs(person, situation, history);
  assert.ok(result.reply.length > 0);
});

test('replyAs: malformed JSON falls back to raw text', async () => {
  mockFetch('Tell me more about what happened.');
  const result = await replyAs(person, situation, history);
  assert.ok(result.reply.length > 0);
  assert.equal(result.done, false);
});

test('replyAs: completely empty response falls back to default message', async () => {
  mockFetch('');
  const result = await replyAs(person, situation, history);
  assert.ok(result.reply.length > 0);
});

test('replyAs: throws when Groq API returns non-ok status', async () => {
  mockFetch('', 429);
  await assert.rejects(() => replyAs(person, situation, history));
});
