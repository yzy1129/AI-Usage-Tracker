import test from 'node:test';
import * as assert from 'node:assert/strict';
import { rebuildDailySummaries } from '../utils/history';
import { MetricsSnapshot } from '../types';

test('rebuildDailySummaries accumulates deltas instead of last snapshot', () => {
    const snapshots: MetricsSnapshot[] = [
      {
        timestamp: 1000,
        date: '2026-05-16',
        hourOfDay: 10,
        providers: [
          { toolId: 'codex', inputTokens: 100, outputTokens: 50, activityCount: 2, activeTimeMs: 60000, model: 'gpt-4o' },
        ],
      },
      {
        timestamp: 2000,
        date: '2026-05-16',
        hourOfDay: 11,
        providers: [
          { toolId: 'codex', inputTokens: 160, outputTokens: 70, activityCount: 3, activeTimeMs: 120000, model: 'gpt-4o' },
        ],
      },
      {
        timestamp: 3000,
        date: '2026-05-17',
        hourOfDay: 9,
        providers: [
          { toolId: 'codex', inputTokens: 40, outputTokens: 10, activityCount: 1, activeTimeMs: 30000, model: 'gpt-4o' },
        ],
      },
    ];

    const dailySummaries = rebuildDailySummaries(snapshots);

    assert.strictEqual(dailySummaries.length, 2);
    assert.deepStrictEqual(dailySummaries[0], {
      date: '2026-05-16',
      providers: [
        {
          toolId: 'codex',
          totalInputTokens: 160,
          totalOutputTokens: 70,
          totalActivityCount: 3,
          totalActiveTimeMs: 120000,
        },
      ],
    });
    assert.deepStrictEqual(dailySummaries[1], {
      date: '2026-05-17',
      providers: [
        {
          toolId: 'codex',
          totalInputTokens: 40,
          totalOutputTokens: 10,
          totalActivityCount: 1,
          totalActiveTimeMs: 30000,
        },
      ],
    });
});

test('rebuildDailySummaries handles provider counter resets', () => {
    const snapshots: MetricsSnapshot[] = [
      {
        timestamp: 1000,
        date: '2026-05-16',
        hourOfDay: 10,
        providers: [
          { toolId: 'claude-code', inputTokens: 400, outputTokens: 80, activityCount: 4, activeTimeMs: 240000, model: 'claude-sonnet-4-5' },
        ],
      },
      {
        timestamp: 2000,
        date: '2026-05-16',
        hourOfDay: 12,
        providers: [
          { toolId: 'claude-code', inputTokens: 50, outputTokens: 10, activityCount: 1, activeTimeMs: 30000, model: 'claude-sonnet-4-5' },
        ],
      },
    ];

    const dailySummaries = rebuildDailySummaries(snapshots);
    assert.deepStrictEqual(dailySummaries[0], {
      date: '2026-05-16',
      providers: [
        {
          toolId: 'claude-code',
          totalInputTokens: 450,
          totalOutputTokens: 90,
          totalActivityCount: 5,
          totalActiveTimeMs: 270000,
        },
      ],
    });
});
