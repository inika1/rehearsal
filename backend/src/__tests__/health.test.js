import { test } from 'node:test';
import assert from 'node:assert';

// Minimal placeholder test so the CI "test" job is real and green.
// Replace with route tests as the backend grows.
test('sanity: math works', () => {
  assert.strictEqual(1 + 1, 2);
});
