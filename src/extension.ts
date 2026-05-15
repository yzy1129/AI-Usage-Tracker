import * as vscode from 'vscode';
import { DetectionService } from './services/detection';
import { AggregatorService } from './services/aggregator';
import { PersistenceService } from './services/persistence';
import { StatusBarUI } from './ui/status-bar';
import { DashboardPanel } from './ui/webview-panel';

export function activate(context: vscode.ExtensionContext) {
  const detection = new DetectionService(context);
  const aggregator = new AggregatorService();
  const persistence = new PersistenceService(context);
  const statusBar = new StatusBarUI();
  const dashboard = new DashboardPanel(context, persistence, detection);

  const providers = detection.detectAndStart();
  aggregator.setProviders(providers);

  aggregator.onMetricsChanged((metrics) => {
    statusBar.update(metrics);
    dashboard.update(metrics);
  });

  persistence.startRecording(() => aggregator.getAggregated());

  const initial = aggregator.getAggregated();
  statusBar.update(initial);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardPanel.viewType, dashboard),
    vscode.commands.registerCommand('aiTracker.showDashboard', () => {
      vscode.commands.executeCommand('aiTracker.dashboard.focus');
    }),
    vscode.commands.registerCommand('aiTracker.refresh', () => {
      const metrics = aggregator.getAggregated();
      statusBar.update(metrics);
      dashboard.update(metrics);
    }),
    vscode.commands.registerCommand('aiTracker.switchSession', (toolId: string, sessionId: string) => {
      const provider = detection.getProviders().find(p => p.toolId === toolId);
      if (provider) {
        provider.switchSession(sessionId);
      }
    }),
    detection,
    aggregator,
    persistence,
    statusBar,
  );
}

export function deactivate() {}
