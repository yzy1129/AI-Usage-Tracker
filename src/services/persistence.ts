import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AggregatedMetrics, HistoryStore, MetricsSnapshot, DailySummary } from '../types';

export class PersistenceService implements vscode.Disposable {
  private storagePath: string;
  private history: HistoryStore;
  private snapshotTimer: NodeJS.Timeout | undefined;
  private saveDebounce: NodeJS.Timeout | undefined;

  constructor(private context: vscode.ExtensionContext) {
    const dir = context.globalStorageUri.fsPath;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.storagePath = path.join(dir, 'history.json');
    this.history = this.load();
  }

  startRecording(getMetrics: () => AggregatedMetrics) {
    this.snapshotTimer = setInterval(() => {
      this.recordSnapshot(getMetrics());
    }, 5 * 60 * 1000);
  }

  recordSnapshot(metrics: AggregatedMetrics) {
    const now = new Date();
    const snapshot: MetricsSnapshot = {
      timestamp: now.getTime(),
      date: now.toISOString().slice(0, 10),
      hourOfDay: now.getHours(),
      providers: metrics.providers.map(p => ({
        toolId: p.toolId,
        inputTokens: p.inputTokens || 0,
        outputTokens: p.outputTokens || 0,
        activityCount: p.activityCount,
        activeTimeMs: p.activeTimeMs,
        model: p.model,
      })),
    };

    this.history.snapshots.push(snapshot);
    this.updateDailySummary(snapshot);
    this.prune();
    this.debouncedSave();
  }

  getHistory(days: number): MetricsSnapshot[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.history.snapshots.filter(s => s.timestamp >= cutoff);
  }

  getDailySummaries(days: number): DailySummary[] {
    return this.history.dailySummaries.slice(-days);
  }

  private updateDailySummary(snapshot: MetricsSnapshot) {
    let summary = this.history.dailySummaries.find(s => s.date === snapshot.date);
    if (!summary) {
      summary = { date: snapshot.date, providers: [] };
      this.history.dailySummaries.push(summary);
    }

    for (const sp of snapshot.providers) {
      let provEntry = summary.providers.find(p => p.toolId === sp.toolId);
      if (!provEntry) {
        provEntry = { toolId: sp.toolId, totalInputTokens: 0, totalOutputTokens: 0, totalActivityCount: 0, totalActiveTimeMs: 0 };
        summary.providers.push(provEntry);
      }
      provEntry.totalInputTokens = sp.inputTokens;
      provEntry.totalOutputTokens = sp.outputTokens;
      provEntry.totalActivityCount = sp.activityCount;
      provEntry.totalActiveTimeMs = sp.activeTimeMs;
    }
  }

  private prune() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.history.snapshots = this.history.snapshots.filter(s => s.timestamp >= cutoff);
    const dateCutoff = new Date(cutoff).toISOString().slice(0, 10);
    this.history.dailySummaries = this.history.dailySummaries.filter(s => s.date >= dateCutoff);
  }

  private load(): HistoryStore {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf8');
        return JSON.parse(data);
      }
    } catch {}
    return { version: 1, snapshots: [], dailySummaries: [] };
  }

  private debouncedSave() {
    if (this.saveDebounce) { clearTimeout(this.saveDebounce); }
    this.saveDebounce = setTimeout(() => this.save(), 5000);
  }

  private save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.history), 'utf8');
    } catch {}
  }

  dispose(): void {
    if (this.snapshotTimer) { clearInterval(this.snapshotTimer); }
    if (this.saveDebounce) { clearTimeout(this.saveDebounce); }
    this.save();
  }
}
