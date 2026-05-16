import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AggregatedMetrics, HistoryStore, MetricsSnapshot, DailySummary } from '../types';
import { rebuildDailySummaries } from '../utils/history';

export class PersistenceService implements vscode.Disposable {
  private storagePath: string;
  private history: HistoryStore;
  private snapshotTimer: NodeJS.Timeout | undefined;
  private saveDebounce: NodeJS.Timeout | undefined;
  private _onHistoryChanged = new vscode.EventEmitter<DailySummary[]>();
  readonly onHistoryChanged = this._onHistoryChanged.event;

  constructor(private context: vscode.ExtensionContext) {
    const dir = context.globalStorageUri.fsPath;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.storagePath = path.join(dir, 'history.json');
    this.history = this.load();
  }

  startRecording(getMetrics: () => AggregatedMetrics) {
    this.recordSnapshot(getMetrics());
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
    this.prune();
    this.history.dailySummaries = rebuildDailySummaries(this.history.snapshots);
    this.debouncedSave();
    this._onHistoryChanged.fire(this.getDailySummaries(7));
  }

  getHistory(days: number): MetricsSnapshot[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.history.snapshots.filter(s => s.timestamp >= cutoff);
  }

  getDailySummaries(days: number): DailySummary[] {
    return this.history.dailySummaries.slice(-days);
  }

  private prune() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.history.snapshots = this.history.snapshots.filter(s => s.timestamp >= cutoff);
  }

  private load(): HistoryStore {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(data) as Partial<HistoryStore>;
        const snapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
        return {
          version: 2,
          snapshots,
          dailySummaries: rebuildDailySummaries(snapshots),
        };
      }
    } catch {
      // Ignore malformed or unavailable persisted history and start fresh.
    }
    return { version: 2, snapshots: [], dailySummaries: [] };
  }

  private debouncedSave() {
    if (this.saveDebounce) { clearTimeout(this.saveDebounce); }
    this.saveDebounce = setTimeout(() => this.save(), 5000);
  }

  private save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.history), 'utf8');
    } catch {
      // Ignore transient storage write failures; a later save will retry.
    }
  }

  dispose(): void {
    if (this.snapshotTimer) { clearInterval(this.snapshotTimer); }
    if (this.saveDebounce) { clearTimeout(this.saveDebounce); }
    this.save();
    this._onHistoryChanged.dispose();
  }
}
