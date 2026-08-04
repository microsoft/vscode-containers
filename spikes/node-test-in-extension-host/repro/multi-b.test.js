const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('suite B', () => {
  test('b1 pass', () => { assert.ok(true); });
  test('b2 async pass', async () => {
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(true);
  });
});
