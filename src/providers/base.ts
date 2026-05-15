import * as vscode from 'vscode';
import { ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';

export abstract class AIProvider implements vscode.Disposable {
  protected _onMetricsChanged = new vscode.EventEmitter<ProviderMetrics>();
  readonly onMetricsChanged = this._onMetricsChanged.event;

  abstract readonly toolId: string;
  abstract readonly displayName: string;
  abstract readonly extensionIds: string[];
  abstract readonly capabilities: ProviderCapabilities;

  abstract start(): void;
  abstract getMetrics(): ProviderMetrics;
  abstract dispose(): void;

  getSessions(): SessionInfo[] { return []; }
  switchSession(_sessionId: string): void {}

  isExtensionInstalled(): boolean {
    return this.extensionIds.some(id => !!vscode.extensions.getExtension(id));
  }

  isExtensionActive(): boolean {
    return this.extensionIds.some(id => {
      const ext = vscode.extensions.getExtension(id);
      return ext?.isActive ?? false;
    });
  }
}
