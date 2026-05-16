import { DailySummary, MetricsSnapshot } from '../types';
import { computeCounterDelta } from './provider-metrics';

function ensureSummaryEntry(date: string, summaryMap: Map<string, DailySummary>): DailySummary {
  let summary = summaryMap.get(date);
  if (!summary) {
    summary = { date, providers: [] };
    summaryMap.set(date, summary);
  }
  return summary;
}

function findSnapshotProvider(snapshot: MetricsSnapshot | undefined, toolId: string) {
  return snapshot?.providers.find((provider) => provider.toolId === toolId);
}

export function mergeSnapshotIntoDailySummary(
  dailySummary: DailySummary,
  snapshot: MetricsSnapshot,
  previousSnapshot?: MetricsSnapshot,
): DailySummary {
  for (const providerSnapshot of snapshot.providers) {
    const previousProvider = findSnapshotProvider(previousSnapshot, providerSnapshot.toolId);
    let providerSummary = dailySummary.providers.find((provider) => provider.toolId === providerSnapshot.toolId);

    if (!providerSummary) {
      providerSummary = {
        toolId: providerSnapshot.toolId,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalActivityCount: 0,
        totalActiveTimeMs: 0,
      };
      dailySummary.providers.push(providerSummary);
    }

    providerSummary.totalInputTokens += computeCounterDelta(previousProvider?.inputTokens, providerSnapshot.inputTokens);
    providerSummary.totalOutputTokens += computeCounterDelta(previousProvider?.outputTokens, providerSnapshot.outputTokens);
    providerSummary.totalActivityCount += computeCounterDelta(previousProvider?.activityCount, providerSnapshot.activityCount);
    providerSummary.totalActiveTimeMs += computeCounterDelta(previousProvider?.activeTimeMs, providerSnapshot.activeTimeMs);
  }

  return dailySummary;
}

export function rebuildDailySummaries(snapshots: MetricsSnapshot[]): DailySummary[] {
  const sortedSnapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const summaryMap = new Map<string, DailySummary>();

  let previousSnapshot: MetricsSnapshot | undefined;
  for (const snapshot of sortedSnapshots) {
    const dailySummary = ensureSummaryEntry(snapshot.date, summaryMap);
    mergeSnapshotIntoDailySummary(dailySummary, snapshot, previousSnapshot);
    previousSnapshot = snapshot;
  }

  return Array.from(summaryMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
