import * as vscode from 'vscode';
import { AggregatedMetrics } from '../types';

function formatTokens(n: number): string {
  if (n >= 100000) { return (n / 1000).toFixed(0) + 'K'; }
  if (n >= 1000) { return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; }
  return n.toString();
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) { return `${minutes}分钟`; }
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}小时${remainMin > 0 ? remainMin + '分' : ''}`;
}

function buildProgressBar(used: number, max: number, width: number = 10): string {
  const ratio = Math.min(used / max, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export class StatusBarUI implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'aiTracker.showDashboard';
    this.item.text = '$(hubot) AI: 检测中...';
    this.item.show();
  }

  update(metrics: AggregatedMetrics) {
    if (metrics.activeProviderCount === 0) {
      this.item.text = '$(hubot) AI: 无活跃会话';
      this.item.tooltip = '未检测到活跃的 AI 工具';
      return;
    }

    const primary = metrics.providers.find(p => p.toolId === metrics.primaryProvider);
    const parts: string[] = [];

    parts.push(`$(hubot) ${primary?.model || primary?.displayName || 'AI'}`);

    if (primary?.contextWindowUsed && primary?.contextWindowMax) {
      const pct = Math.round((primary.contextWindowUsed / primary.contextWindowMax) * 100);
      const bar = buildProgressBar(primary.contextWindowUsed, primary.contextWindowMax);
      parts.push(`${bar} ${pct}%`);
    }

    if (metrics.totalInputTokens > 0 || metrics.totalOutputTokens > 0) {
      parts.push(`输入:${formatTokens(metrics.totalInputTokens)} 输出:${formatTokens(metrics.totalOutputTokens)}`);
    }

    parts.push(`对话:${metrics.totalActivityCount}`);

    if (metrics.activeProviderCount > 1) {
      parts.push(`${metrics.activeProviderCount}个AI活跃`);
    }

    this.item.text = parts.join(' | ');

    const tooltipLines: string[] = ['--- AI 使用追踪 ---'];
    for (const p of metrics.providers) {
      if (!p.isActive && p.activityCount === 0) {continue;}
      const status = p.isActive ? '🟢' : '⚪';
      let line = `${status} ${p.displayName}`;
      if (p.model) { line += ` (${p.model})`; }
      if (p.inputTokens) { line += ` | 输入:${formatTokens(p.inputTokens)} 输出:${formatTokens(p.outputTokens || 0)}`; }
      if (p.activeTimeMs > 0) { line += ` | 时长:${formatTime(p.activeTimeMs)}`; }
      tooltipLines.push(line);
    }
    this.item.tooltip = tooltipLines.join('\n');
  }

  dispose(): void {
    this.item.dispose();
  }
}
