import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AggregatedMetrics } from '../types';
import { PersistenceService } from '../services/persistence';
import { DetectionService } from '../services/detection';
import { KNOWN_AI_EXTENSIONS } from '../constants';

interface IconMap { [toolId: string]: string; }

export class DashboardPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiTracker.dashboard';
  private view?: vscode.WebviewView;
  private latestMetrics?: AggregatedMetrics;

  constructor(
    private context: vscode.ExtensionContext,
    private persistence: PersistenceService,
    private detection: DetectionService
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: this.getResourceRoots(),
    };
    webviewView.webview.html = this.getHtml();

    const icons = this.collectIcons(webviewView.webview);
    webviewView.webview.postMessage({ type: 'icons', data: icons });

    if (this.latestMetrics) {
      this.postMetrics(this.latestMetrics);
    }

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'requestHistory') {
        const history = this.persistence.getDailySummaries(7);
        webviewView.webview.postMessage({ type: 'history', data: history });
      }
      if (msg.type === 'switchSession') {
        vscode.commands.executeCommand('aiTracker.switchSession', msg.toolId, msg.sessionId);
      }
      if (msg.type === 'requestIcons') {
        const ic = this.collectIcons(webviewView.webview);
        webviewView.webview.postMessage({ type: 'icons', data: ic });
      }
    });
  }

  update(metrics: AggregatedMetrics) {
    this.latestMetrics = metrics;
    this.postMetrics(metrics);
  }

  private postMetrics(metrics: AggregatedMetrics) {
    if (this.view) {
      this.view.webview.postMessage({ type: 'metrics', data: metrics });
    }
  }

  private getResourceRoots(): vscode.Uri[] {
    const roots: vscode.Uri[] = [];
    for (const ext of vscode.extensions.all) {
      roots.push(ext.extensionUri);
    }
    return roots;
  }

  private collectIcons(webview: vscode.Webview): IconMap {
    const icons: IconMap = {};

    for (const def of KNOWN_AI_EXTENSIONS) {
      for (const extId of def.extensionIds) {
        const ext = vscode.extensions.getExtension(extId);
        if (ext && ext.packageJSON.icon) {
          const iconPath = path.join(ext.extensionPath, ext.packageJSON.icon);
          if (fs.existsSync(iconPath)) {
            const uri = webview.asWebviewUri(vscode.Uri.file(iconPath));
            icons[def.toolId] = uri.toString();
            break;
          }
        }
      }
    }

    // Also scan for dynamically detected extensions
    for (const provider of this.detection.getProviders()) {
      if (icons[provider.toolId]) {continue;}
      for (const extId of provider.extensionIds) {
        const ext = vscode.extensions.getExtension(extId);
        if (ext && ext.packageJSON.icon) {
          const iconPath = path.join(ext.extensionPath, ext.packageJSON.icon);
          if (fs.existsSync(iconPath)) {
            const uri = webview.asWebviewUri(vscode.Uri.file(iconPath));
            icons[provider.toolId] = uri.toString();
            break;
          }
        }
      }
    }

    return icons;
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: var(--vscode-sideBar-background);
  --fg: var(--vscode-editor-foreground, #d4d4d4);
  --border: var(--vscode-panel-border, rgba(255,255,255,0.08));
  --card: var(--vscode-editor-background);
  --accent: var(--vscode-textLink-foreground, #4fc1ff);
  --muted: var(--vscode-descriptionForeground, #a0a0a0);
  --hover: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
  --radius: 8px;
  --shadow: 0 2px 8px rgba(0,0,0,0.2);
}
body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
  font-size: 12px; color: var(--fg); padding: 16px 12px;
  line-height: 1.5;
}
.header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.header-title { font-size: 14px; font-weight: 700; flex: 1; color: var(--fg); }
.header-badge {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  background: var(--accent); color: #000; font-weight: 600;
}
.section { margin-bottom: 20px; }
.section-title {
  font-size: 11px; font-weight: 600; color: var(--fg);
  text-transform: uppercase; letter-spacing: 0.8px;
  margin-bottom: 10px; padding-bottom: 4px;
  border-bottom: 1px solid var(--border); opacity: 0.75;
}

.provider-card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 12px; margin-bottom: 10px;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative; overflow: hidden;
}
.provider-card:hover { border-color: var(--accent); box-shadow: var(--shadow); }
.provider-card::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; border-radius: 3px 0 0 3px;
}
.provider-card.active::before { background: var(--accent); }
.provider-card.inactive::before { background: var(--muted); opacity: 0.3; }

.provider-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.provider-icon {
  width: 28px; height: 28px; border-radius: 6px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); flex-shrink: 0;
}
.provider-icon img { width: 22px; height: 22px; object-fit: contain; }
.provider-icon .fallback { font-size: 16px; }
.provider-info { flex: 1; min-width: 0; }
.provider-name { font-weight: 600; font-size: 12px; color: var(--fg); }
.provider-model {
  font-size: 10px; color: var(--muted); margin-top: 1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.provider-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.provider-status.on { background: #4ade80; box-shadow: 0 0 6px rgba(74,222,128,0.5); }
.provider-status.off { background: #64748b; }

.provider-metrics {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px;
  padding-top: 8px; border-top: 1px solid var(--border);
}
.metric-item { display: flex; justify-content: space-between; align-items: center; }
.metric-label { font-size: 10px; color: var(--muted); }
.metric-value { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--fg); }

.session-select {
  width: 100%; margin-top: 8px; padding: 7px 28px 7px 10px;
  background: rgba(255,255,255,0.04); color: var(--fg); border: 1px solid var(--border);
  border-radius: 6px; font-size: 11px; cursor: pointer;
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23aaa'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
  transition: border-color 0.2s, background 0.2s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.session-select:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }
.session-select:focus { outline: none; border-color: var(--accent); background: rgba(255,255,255,0.06); }
.session-select option {
  background: var(--vscode-dropdown-background, #252526);
  color: var(--vscode-dropdown-foreground, #ccc);
  padding: 6px;
}

.ctx-container { margin-bottom: 12px; }
.ctx-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
.ctx-label { font-size: 11px; color: var(--fg); opacity: 0.7; }
.ctx-pct { font-size: 13px; font-weight: 700; color: var(--fg); }
.ctx-bar {
  height: 6px; background: var(--border); border-radius: 3px;
  overflow: hidden; position: relative;
}
.ctx-fill {
  height: 100%; border-radius: 3px;
  transition: width 0.4s cubic-bezier(0.4,0,0.2,1);
  background: linear-gradient(90deg, var(--accent), #a78bfa);
}
.ctx-fill.warn { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
.ctx-fill.danger { background: linear-gradient(90deg, #ef4444, #dc2626); }
.ctx-detail { display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; color: var(--fg); opacity: 0.6; }

.summary-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.summary-card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 12px; text-align: center;
}
.summary-value { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: var(--fg); }
.summary-label { font-size: 10px; color: var(--muted); margin-top: 4px; }

.timeline { margin-top: 8px; }
.timeline-row {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.timeline-label { width: 36px; font-size: 10px; color: var(--muted); text-align: right; flex-shrink: 0; }
.timeline-bars { flex: 1; display: flex; gap: 2px; height: 18px; align-items: flex-end; }
.timeline-bar { flex: 1; border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.3s ease; }
.timeline-value { width: 32px; font-size: 10px; color: var(--fg); text-align: right; flex-shrink: 0; opacity: 0.7; }

.empty { text-align: center; padding: 32px 16px; color: var(--muted); font-size: 12px; }
.empty-icon { font-size: 28px; margin-bottom: 8px; opacity: 0.5; }
</style>
</head>
<body>
<div class="header">
  <div class="header-title">AI 使用追踪</div>
  <div class="header-badge" id="badge">0 活跃</div>
</div>

<div class="section" id="ctx-section" style="display:none">
  <div class="section-title">上下文窗口</div>
  <div class="ctx-container">
    <div class="ctx-header">
      <span class="ctx-label" id="ctx-model">-</span>
      <span class="ctx-pct" id="ctx-pct">0%</span>
    </div>
    <div class="ctx-bar"><div class="ctx-fill" id="ctx-fill" style="width:0%"></div></div>
    <div class="ctx-detail"><span id="ctx-used">0</span><span id="ctx-max">200K</span></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Token 用量</div>
  <div class="summary-row">
    <div class="summary-card"><div class="summary-value" id="s-input">0</div><div class="summary-label">输入</div></div>
    <div class="summary-card"><div class="summary-value" id="s-output">0</div><div class="summary-label">输出</div></div>
    <div class="summary-card"><div class="summary-value" id="s-activity">0</div><div class="summary-label">交互</div></div>
    <div class="summary-card"><div class="summary-value" id="s-time">0分</div><div class="summary-label">时长</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">AI 工具</div>
  <div id="providers-list"><div class="empty"><div class="empty-icon">🔍</div>正在扫描...</div></div>
</div>

<div class="section">
  <div class="section-title">7日趋势</div>
  <div class="timeline" id="timeline"><div class="empty"><div class="empty-icon">📊</div>暂无历史数据</div></div>
</div>

<script>
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: 'requestHistory' });
vscode.postMessage({ type: 'requestIcons' });

let iconMap = {};

const COLORS = {
  'claude-code':'#c4956a','github-copilot':'#6366f1','codex':'#10b981',
  'kilo-code':'#f59e0b','cody':'#ff6b6b','tabnine':'#6c5ce7',
  'codeium':'#09c184','cursor':'#7c3aed','amazon-q':'#ff9900','gemini':'#4285f4'
};

function fmt(n) {
  if (!n) return '0';
  if (n >= 100000) return (n/1000).toFixed(0)+'K';
  if (n >= 1000) return (n/1000).toFixed(1).replace(/\\.0$/,'')+'K';
  return n.toString();
}
function fmtTime(ms) {
  if (!ms) return '0分';
  const m = Math.floor(ms/60000);
  if (m < 60) return m+'分';
  return Math.floor(m/60)+'时'+(m%60>0?(m%60)+'分':'');
}
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000)+'分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000)+'小时前';
  return Math.floor(diff/86400000)+'天前';
}

function getIcon(toolId) {
  if (iconMap[toolId]) {
    return '<img src="'+iconMap[toolId]+'" alt="">';
  }
  return '<span class="fallback">🤖</span>';
}

window.addEventListener('message', e => {
  if (e.data.type === 'metrics') renderMetrics(e.data.data);
  if (e.data.type === 'history') renderTimeline(e.data.data);
  if (e.data.type === 'icons') { iconMap = e.data.data; if (lastMetrics) renderMetrics(lastMetrics); }
});

let lastMetrics = null;

function renderMetrics(m) {
  lastMetrics = m;
  document.getElementById('badge').textContent = m.activeProviderCount + ' 活跃';

  const primary = m.providers.find(p => p.toolId === m.primaryProvider);
  const ctxSec = document.getElementById('ctx-section');
  if (primary && primary.contextWindowUsed && primary.contextWindowMax) {
    ctxSec.style.display = '';
    const pct = Math.min(100, Math.round(primary.contextWindowUsed/primary.contextWindowMax*100));
    document.getElementById('ctx-model').textContent = primary.model || primary.displayName;
    document.getElementById('ctx-pct').textContent = pct+'%';
    document.getElementById('ctx-used').textContent = fmt(primary.contextWindowUsed)+' 已用';
    document.getElementById('ctx-max').textContent = fmt(primary.contextWindowMax)+' 上限';
    const fill = document.getElementById('ctx-fill');
    fill.style.width = pct+'%';
    fill.className = 'ctx-fill'+(pct>80?' danger':pct>60?' warn':'');
  } else { ctxSec.style.display = 'none'; }

  document.getElementById('s-input').textContent = fmt(m.totalInputTokens);
  document.getElementById('s-output').textContent = fmt(m.totalOutputTokens);
  document.getElementById('s-activity').textContent = m.totalActivityCount;
  document.getElementById('s-time').textContent = fmtTime(m.totalActiveTimeMs);

  const list = document.getElementById('providers-list');
  const visible = m.providers.filter(p => p.isActive || p.activityCount > 0);
  if (visible.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">😴</div>暂无活跃的 AI 工具</div>';
    return;
  }
  list.innerHTML = visible.map(p => {
    const active = p.isActive;
    let metricsHtml = '';
    if (p.inputTokens || p.outputTokens) {
      metricsHtml = '<div class="provider-metrics">'
        +'<div class="metric-item"><span class="metric-label">输入</span><span class="metric-value">'+fmt(p.inputTokens)+'</span></div>'
        +'<div class="metric-item"><span class="metric-label">输出</span><span class="metric-value">'+fmt(p.outputTokens)+'</span></div>'
        +'<div class="metric-item"><span class="metric-label">缓存读</span><span class="metric-value">'+fmt(p.cacheReadTokens)+'</span></div>'
        +'<div class="metric-item"><span class="metric-label">缓存写</span><span class="metric-value">'+fmt(p.cacheCreationTokens)+'</span></div>'
        +'</div>';
    } else {
      metricsHtml = '<div class="provider-metrics">'
        +'<div class="metric-item"><span class="metric-label">交互</span><span class="metric-value">'+p.activityCount+'</span></div>'
        +'<div class="metric-item"><span class="metric-label">时长</span><span class="metric-value">'+fmtTime(p.activeTimeMs)+'</span></div>'
        +'</div>';
    }
    let sessionHtml = '';
    if (p.sessions && p.sessions.length > 1) {
      sessionHtml = '<select class="session-select" data-tool="'+p.toolId+'" onchange="switchSession(this)">'
        + p.sessions.map(s =>
          '<option value="'+s.id+'"'+(s.id===p.activeSessionId?' selected':'')+'>'+
          (s.title||s.id.slice(0,8))+' · '+timeAgo(s.lastActive)+'</option>'
        ).join('')+'</select>';
    } else if (p.sessions && p.sessions.length === 1) {
      sessionHtml = '<select class="session-select" disabled>'
        +'<option>'+(p.sessions[0].title||p.sessions[0].id.slice(0,8))+' · '+timeAgo(p.sessions[0].lastActive)+'</option>'
        +'</select>';
    } else if (!p.sessions || p.sessions.length === 0) {
      sessionHtml = '<select class="session-select" disabled>'
        +'<option>暂无对话记录</option>'
        +'</select>';
    }
    return '<div class="provider-card '+(active?'active':'inactive')+'">'
      +'<div class="provider-top">'
        +'<div class="provider-icon">'+getIcon(p.toolId)+'</div>'
        +'<div class="provider-info"><div class="provider-name">'+p.displayName+'</div>'
          +'<div class="provider-model">'+(p.model||'暂无模型')+'</div>'
        +'</div>'
        +'<div class="provider-status '+(active?'on':'off')+'"></div>'
      +'</div>'
      +metricsHtml+sessionHtml
    +'</div>';
  }).join('');
}

function switchSession(el) {
  vscode.postMessage({ type:'switchSession', toolId: el.dataset.tool, sessionId: el.value });
}

function renderTimeline(summaries) {
  const el = document.getElementById('timeline');
  if (!summaries || summaries.length === 0) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📊</div>暂无历史数据</div>';
    return;
  }
  const maxAct = Math.max(...summaries.flatMap(d => d.providers.map(p => p.totalActivityCount)),1);
  el.innerHTML = summaries.slice(-7).map(day => {
    const label = day.date.slice(5);
    const bars = day.providers.map(p => {
      const h = Math.max(2, Math.round(p.totalActivityCount/maxAct*18));
      const c = COLORS[p.toolId]||'#64748b';
      return '<div class="timeline-bar" style="height:'+h+'px;background:'+c+'" title="'+p.toolId+': '+p.totalActivityCount+'"></div>';
    }).join('');
    const total = day.providers.reduce((s,p)=>s+p.totalActivityCount,0);
    return '<div class="timeline-row"><div class="timeline-label">'+label+'</div><div class="timeline-bars">'+bars+'</div><div class="timeline-value">'+total+'</div></div>';
  }).join('');
}
</script>
</body>
</html>`;
  }
}