const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('repro suite', () => {
  test('trivial', () => { assert.strictEqual(1 + 1, 2); });
});
