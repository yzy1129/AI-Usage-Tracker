import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  calculateObservedDuration,
  computeCounterDelta,
  isRecentlyActive,
} from '../utils/provider-metrics';

test('isRecentlyActive respects active window', () => {
  assert.strictEqual(isRecentlyActive(1000, 1000 + 5 * 60 * 1000), true);
  assert.strictEqual(isRecentlyActive(1000, 1000 + 20 * 60 * 1000), false);
});

test('calculateObservedDuration uses last active when inactive', () => {
  assert.strictEqual(calculateObservedDuration(1000, 5000, false, 9000), 4000);
  assert.strictEqual(calculateObservedDuration(1000, 5000, true, 9000), 8000);
  assert.strictEqual(calculateObservedDuration(0, 5000, true, 9000), 0);
});

test('computeCounterDelta handles resets', () => {
  assert.strictEqual(computeCounterDelta(undefined, 10), 10);
  assert.strictEqual(computeCounterDelta(10, 25), 15);
  assert.strictEqual(computeCounterDelta(25, 10), 10);
  assert.strictEqual(computeCounterDelta(10, 0), 0);
});
