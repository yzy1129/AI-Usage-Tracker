import * as vscode from 'vscode';
import { AIProvider } from './base';
import { ProviderCapabilities, ProviderMetrics } from '../types';
import { AIExtensionDef } from '../constants';

export class GenericAIProvider extends AIProvider {
  readonly toolId: string;
  readonly displayName: string;
  readonly extensionIds: string[];
  readonly capabilities: ProviderCapabilities = {
    hasTokenMetrics: false,
    hasModelInfo: false,
    hasContextWindow: false,
    hasMultiSession: false,
  };

  private activityCount = 0;
  private activeTimeMs = 0;
  private sessionStartTime = 0;
  private lastActivityTime = 0;
  private wasActive = false;
  private pollTimer: NodeJS.Timeout | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext, def: AIExtensionDef) {
    super();
    this.toolId = def.toolId;
    this.displayName = def.displayName;
    this.extensionIds = def.extensionIds;
  }

  start(): void {
    if (!this.isExtensionInstalled()) {return;}
    this.sessionStartTime = Date.now();
    this.wasActive = this.isExtensionActive();

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.checkActivationChange();
      }),
    );

    if (vscode.window.tabGroups) {
      this.disposables.push(
        vscode.window.tabGroups.onDidChangeTabs(() => {
          this.checkActivationChange();
        }),
      );
    }

    this.pollTimer = setInterval(() => {
      if (this.isExtensionActive() && this.lastActivityTime > 0) {
        const now = Date.now();
        if (now - this.lastActivityTime < 60000) {
          this.activeTimeMs += 10000;
        }
      }
      this._onMetricsChanged.fire(this.getMetrics());
    }, 10000);
  }

  private checkActivationChange() {
    const isActive = this.isExtensionActive();
    if (isActive && !this.wasActive) {
      const now = Date.now();
      if (now - this.lastActivityTime > 2000) {
        this.activityCount++;
      }
      this.lastActivityTime = now;
      this._onMetricsChanged.fire(this.getMetrics());
    }
    if (isActive !== this.wasActive) {
      this.wasActive = isActive;
      this._onMetricsChanged.fire(this.getMetrics());
    }
  }

  getMetrics(): ProviderMetrics {
    return {
      toolId: this.toolId,
      displayName: this.displayName,
      isActive: this.isExtensionActive(),
      lastUpdated: this.lastActivityTime || this.sessionStartTime || 0,
      activityCount: this.activityCount,
      sessionStartTime: this.sessionStartTime || undefined,
      activeTimeMs: this.activeTimeMs,
    };
  }

  dispose(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); }
    this.disposables.forEach(d => d.dispose());
    this._onMetricsChanged.dispose();
  }
}
