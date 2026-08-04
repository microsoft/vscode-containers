const { test, describe } = require('node:test');
const assert = require('node:assert');
const { add } = require('../extension');

describe('poc suite', () => {
  test('add works', () => { assert.strictEqual(add(2, 3), 5); });

  // The point of the whole spike: the `vscode` module must resolve, which only
  // happens because the runner uses isolation:'none' (same process as the host).
  test('vscode api present', () => {
    const vscode = require('vscode');
    assert.ok(vscode.workspace, 'vscode.workspace should exist');
  });
});
