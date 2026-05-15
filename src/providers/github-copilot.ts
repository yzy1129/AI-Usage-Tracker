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
  private pollTimer: NodeJS.Timeout | undefined;
  private docChangeDisposable: vscode.Disposable | undefined;

  constructor(private context: vscode.ExtensionContext) {
    super();
  }

  start(): void {
    if (!this.isExtensionInstalled()) {return;}
    this.sessionStartTime = Date.now();

    this.docChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length > 0 && this.isExtensionActive()) {
        this.recordActivity();
      }
    });

    this.pollTimer = setInterval(() => {
      if (this.isExtensionActive() && this.lastActivityTime > 0) {
        const now = Date.now();
        if (now - this.lastActivityTime < 60000) {
          this.activeTimeMs += 30000;
        }
      }
      this._onMetricsChanged.fire(this.getMetrics());
    }, 30000);
  }

  private recordActivity() {
    const now = Date.now();
    if (now - this.lastActivityTime > 5000) {
      this.activityCount++;
      this._onMetricsChanged.fire(this.getMetrics());
    }
    this.lastActivityTime = now;
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
    if (this.docChangeDisposable) { this.docChangeDisposable.dispose(); }
    this._onMetricsChanged.dispose();
  }
}
