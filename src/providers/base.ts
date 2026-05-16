import * as vscode from 'vscode';
import { ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';

function findExtensionById(extensionId: string): vscode.Extension<any> | undefined {
  const target = extensionId.toLowerCase();
  return vscode.extensions.all.find(ext => ext.id.toLowerCase() === target);
}

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

  refresh(): Promise<void> | void {}
  getSessions(): SessionInfo[] { return []; }
  switchSession(_sessionId: string): void {}

  isExtensionInstalled(): boolean {
    return this.extensionIds.some(id => !!findExtensionById(id));
  }

  isExtensionActive(): boolean {
    return this.extensionIds.some(id => {
      const ext = findExtensionById(id);
      return ext?.isActive ?? false;
    });
  }
}
