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
  private pollTimer: NodeJS.Timeout | undefined;

  constructor(private context: vscode.ExtensionContext, def: AIExtensionDef) {
    super();
    this.toolId = def.toolId;
    this.displayName = def.displayName;
    this.extensionIds = def.extensionIds;
  }

  start(): void {
    if (!this.isExtensionInstalled()) {return;}
    this.sessionStartTime = Date.now();

    this.pollTimer = setInterval(() => {
      if (this.isExtensionActive()) {
        this.activeTimeMs += 30000;
        this.activityCount++;
      }
      this._onMetricsChanged.fire(this.getMetrics());
    }, 30000);
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
    this._onMetricsChanged.dispose();
  }
}
