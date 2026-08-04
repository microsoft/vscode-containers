const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('suite A', () => {
  test('a1 pass', () => { assert.ok(true); });
  test('a2 fail', () => { assert.strictEqual(1, 2, 'deliberate'); });
});

test('top level in file A', () => { assert.ok(true); });
