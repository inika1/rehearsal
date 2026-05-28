const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

async function callClaude(system, messages, maxTokens = 400) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error('Claude API error: ' + res.status);
  const data = await res.json();
  return data.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

export async function replyAs(person, situation, history) {
  if (!API_KEY) {
    const canned = [
      `Hey — what's up?`,
      `Oh. I didn't realise that was bothering you.`,
      `Okay, that's fair. What do you want me to do?`,
      `Alright, I hear you. Let's sort it out.`,
    ];
    return (
      canned[Math.min(history.filter((m) => m.role === 'me').length - 1, canned.length - 1)] ||
      canned[0]
    );
  }

  const system =
    `You are roleplaying as ${person.name}, the other person in a difficult conversation. ` +
    `Your relationship to the user: ${person.relationship || 'unspecified'}. ` +
    `The user is practising this conversation: "${situation}". ` +
    `Stay fully in character as ${person.name}. Be realistic — react naturally, don't be a pushover, ` +
    `but don't be cartoonishly hostile. Keep replies short (1-3 sentences), like real speech.`;

  const messages = history.map((m) => ({
    role: m.role === 'me' ? 'user' : 'assistant',
    content: m.content,
  }));

  return callClaude(system, messages, 200);
}

export async function analyse(person, situation, transcript) {
  if (!API_KEY) {
    const myTurns = transcript.filter((m) => m.role === 'me');
    const text = myTurns.map((m) => m.content.toLowerCase()).join(' ');
    const hedges = (text.match(/\b(sorry|just|maybe|kind of|i guess|no rush|it's fine)\b/g) || [])
      .length;
    const tension = Math.min(90, 40 + hedges * 8);
    const emotion = Math.max(20, 80 - hedges * 7);
    return {
      tension,
      emotion,
      insight_tend:
        hedges > 1
          ? 'soften your point with hedges, which can hide what you actually need.'
          : 'state your point fairly directly.',
      insight_try: 'name the concrete ask early and once, then stop talking.',
      insight_used: `${hedges} softening phrase${hedges === 1 ? '' : 's'} (e.g. "sorry", "just", "it\'s fine").`,
    };
  }

  const system =
    `You are a communication coach analysing a rehearsal transcript. ` +
    `The user was practising: "${situation}" with ${person.name}. ` +
    `Return ONLY a JSON object, no markdown, with exactly these keys: ` +
    `{"tension": <0-100 int, how tense the exchange got>, ` +
    `"emotion": <0-100 int, how well the user kept emotional control>, ` +
    `"insight_tend": "<short: a habit the user tends to do>", ` +
    `"insight_try": "<short: one concrete thing to try next time>", ` +
    `"insight_used": "<short: a specific phrase/pattern they used>"}.`;

  const convoText = transcript
    .map((m) => `${m.role === 'me' ? 'User' : person.name}: ${m.content}`)
    .join('\n');
  const raw = await callClaude(system, [{ role: 'user', content: convoText }], 400);
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return { tension: 50, emotion: 50, insight_tend: '—', insight_try: '—', insight_used: '—' };
  }
}
