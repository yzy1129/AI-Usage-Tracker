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

  detection.onProvidersChanged((updatedProviders) => {
    aggregator.setProviders(updatedProviders);
    const metrics = aggregator.getAggregated();
    statusBar.update(metrics);
    dashboard.update(metrics);
  });

  aggregator.onMetricsChanged((metrics) => {
    statusBar.update(metrics);
    dashboard.update(metrics);
  });

  persistence.startRecording(() => aggregator.getAggregated());

  const initial = aggregator.getAggregated();
  statusBar.update(initial);
  dashboard.update(initial);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardPanel.viewType, dashboard),
    vscode.commands.registerCommand('aiTracker.showDashboard', () => {
      vscode.commands.executeCommand('aiTracker.dashboard.focus');
    }),
    vscode.commands.registerCommand('aiTracker.refresh', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AI Tracker 正在刷新指标',
        },
        async () => {
          await detection.refreshProviders();
        },
      );

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
    dashboard,
  );
}

export function deactivate() {}
