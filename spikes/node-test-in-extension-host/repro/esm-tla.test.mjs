// ESM + top-level await: the hardest case for the "all root items are enqueued
// before any executes" assumption the runner's completion detector relies on.
import { describe, it } from 'node:test';
import assert from 'node:assert';

await new Promise((r) => setTimeout(r, 30));

describe('esm suite with TLA', () => {
  it('esm works', () => { assert.ok(true); });
});
