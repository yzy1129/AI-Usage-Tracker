import * as vscode from 'vscode';
import { AIProvider } from '../providers/base';
import { AggregatedMetrics, ProviderMetrics } from '../types';

export class AggregatorService implements vscode.Disposable {
  private _onMetricsChanged = new vscode.EventEmitter<AggregatedMetrics>();
  readonly onMetricsChanged = this._onMetricsChanged.event;

  private providers: AIProvider[] = [];
  private subscriptions: vscode.Disposable[] = [];
  private throttleTimer: NodeJS.Timeout | undefined;

  setProviders(providers: AIProvider[]) {
    this.subscriptions.forEach(s => s.dispose());
    this.subscriptions = [];
    this.providers = providers;

    for (const provider of providers) {
      const sub = provider.onMetricsChanged(() => {
        this.throttledEmit();
      });
      this.subscriptions.push(sub);
    }
  }

  private throttledEmit() {
    if (this.throttleTimer) {return;}
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = undefined;
      this._onMetricsChanged.fire(this.getAggregated());
    }, 1000);
  }

  getAggregated(): AggregatedMetrics {
    const providerMetrics: ProviderMetrics[] = this.providers.map(p => p.getMetrics());

    let totalInput = 0;
    let totalOutput = 0;
    let totalActivity = 0;
    let totalTime = 0;
    let activeCount = 0;
    let primaryProvider: ProviderMetrics | undefined;

    for (const m of providerMetrics) {
      totalInput += m.inputTokens || 0;
      totalOutput += m.outputTokens || 0;
      totalActivity += m.activityCount;
      totalTime += m.activeTimeMs;
      if (m.isActive) { activeCount++; }
      if (!primaryProvider || m.lastUpdated > primaryProvider.lastUpdated) {
        if (m.isActive) { primaryProvider = m; }
      }
    }

    return {
      providers: providerMetrics,
      totalActivityCount: totalActivity,
      totalActiveTimeMs: totalTime,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      activeProviderCount: activeCount,
      primaryProvider: primaryProvider?.toolId,
    };
  }

  dispose(): void {
    this.subscriptions.forEach(s => s.dispose());
    if (this.throttleTimer) { clearTimeout(this.throttleTimer); }
    this._onMetricsChanged.dispose();
  }
}
