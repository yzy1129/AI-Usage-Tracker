import * as vscode from 'vscode';
import { AIProvider } from './base';
import { AIToolId, ProviderCapabilities, ProviderMetrics } from '../types';

export class GitHubCopilotProvider extends AIProvider {
  readonly toolId: AIToolId = 'github-copilot';
  readonly displayName = 'GitHub Copilot';
  readonly extensionIds = ['github.copilot', 'github.copilot-chat'];
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

  constructor(private context: vscode.ExtensionContext) {
    super();
  }

  start(): void {
    if (!this.isExtensionInstalled()) {return;}
    this.sessionStartTime = Date.now();
    this.wasActive = this.isExtensionActive();

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length > 0 && this.isExtensionActive()) {
          this.recordActivity();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.checkActivationChange();
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => {
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

    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) { this.checkActivationChange(); }
      }),
    );

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

  private recordActivity() {
    const now = Date.now();
    if (now - this.lastActivityTime > 2000) {
      this.activityCount++;
      this._onMetricsChanged.fire(this.getMetrics());
    }
    this.lastActivityTime = now;
  }

  private checkActivationChange() {
    const isActive = this.isExtensionActive();
    if (isActive && !this.wasActive) {
      this.recordActivity();
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
      lastUpdated: Date.now(),
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
