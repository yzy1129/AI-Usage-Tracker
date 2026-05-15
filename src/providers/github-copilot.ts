import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider } from './base';
import { AIToolId, ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';

interface CopilotSessionData {
  id: string;
  file: string;
  title: string;
  model: string;
  maxInputTokens: number;
  requestCount: number;
  startTime: number;
  lastActive: number;
}

export class GitHubCopilotProvider extends AIProvider {
  readonly toolId: AIToolId = 'github-copilot';
  readonly displayName = 'GitHub Copilot';
  readonly extensionIds = ['github.copilot', 'github.copilot-chat'];
  readonly capabilities: ProviderCapabilities = {
    hasTokenMetrics: false,
    hasModelInfo: true,
    hasContextWindow: false,
    hasMultiSession: true,
  };

  private sessions: Map<string, CopilotSessionData> = new Map();
  private activeSessionId = '';
  private chatSessionsDir = '';
  private dirWatcher: fs.FSWatcher | undefined;
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private pollTimer: NodeJS.Timeout | undefined;

  constructor(private context: vscode.ExtensionContext) {
    super();
  }

  start(): void {
    if (!this.isExtensionInstalled()) { return; }
    this.findChatSessionsDir();
    if (this.chatSessionsDir) {
      this.scanSessions();
      this.watchDirectory();
    }

    this.pollTimer = setInterval(() => {
      if (this.chatSessionsDir) {
        this.scanSessions();
      }
    }, 15000);
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.lastActive - a.lastActive)
      .map(s => ({
        id: s.id,
        title: s.title || s.id.slice(0, 8),
        startTime: s.startTime,
        lastActive: s.lastActive,
        model: s.model,
        isActive: s.id === this.activeSessionId,
      }));
  }

  switchSession(sessionId: string): void {
    this.activeSessionId = sessionId;
    this._onMetricsChanged.fire(this.getMetrics());
  }

  getMetrics(): ProviderMetrics {
    const active = this.getActiveSession();
    if (!active) {
      return {
        toolId: this.toolId, displayName: this.displayName,
        isActive: this.isExtensionActive(), lastUpdated: 0,
        activityCount: 0, activeTimeMs: 0,
        sessions: this.getSessions(), activeSessionId: this.activeSessionId,
      };
    }
    return {
      toolId: this.toolId, displayName: this.displayName,
      isActive: true, lastUpdated: active.lastActive || 0,
      model: active.model || undefined,
      activityCount: active.requestCount,
      sessionStartTime: active.startTime || undefined,
      activeTimeMs: active.startTime ? Date.now() - active.startTime : 0,
      sessions: this.getSessions(),
      activeSessionId: this.activeSessionId,
    };
  }

  dispose(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); }
    if (this.dirWatcher) { this.dirWatcher.close(); }
    this.fileWatchers.forEach(w => w.close());
    this._onMetricsChanged.dispose();
  }

  private getActiveSession(): CopilotSessionData | undefined {
    if (this.activeSessionId) {
      const found = this.sessions.get(this.activeSessionId);
      if (found) { return found; }
    }
    let latest: CopilotSessionData | undefined;
    for (const [, s] of this.sessions) {
      if (!latest || s.lastActive > latest.lastActive) { latest = s; }
    }
    if (latest) { this.activeSessionId = latest.id; }
    return latest;
  }

  private findChatSessionsDir() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) { return; }

    const appData = process.env.APPDATA || '';
    if (!appData) { return; }

    const workspaceStorageDir = path.join(appData, 'Code', 'User', 'workspaceStorage');
    if (!fs.existsSync(workspaceStorageDir)) { return; }

    try {
      const dirs = fs.readdirSync(workspaceStorageDir);
      for (const dir of dirs) {
        const chatDir = path.join(workspaceStorageDir, dir, 'chatSessions');
        if (fs.existsSync(chatDir)) {
          const workspaceJson = path.join(workspaceStorageDir, dir, 'workspace.json');
          if (fs.existsSync(workspaceJson)) {
            const content = fs.readFileSync(workspaceJson, 'utf8');
            const wsPath = workspaceFolders[0].uri.fsPath;
            if (content.includes(wsPath) || content.includes(wsPath.replace(/\\/g, '/'))) {
              this.chatSessionsDir = chatDir;
              return;
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  private scanSessions() {
    if (!this.chatSessionsDir || !fs.existsSync(this.chatSessionsDir)) { return; }
    try {
      const files = fs.readdirSync(this.chatSessionsDir).filter(f => f.endsWith('.jsonl'));
      let changed = false;
      for (const file of files) {
        const fullPath = path.join(this.chatSessionsDir, file);
        const sessionId = path.basename(file, '.jsonl');
        if (!this.sessions.has(sessionId)) {
          this.loadSession(fullPath, sessionId);
          changed = true;
        }
        if (!this.fileWatchers.has(fullPath)) {
          this.watchFile(fullPath, sessionId);
        }
      }
      if (changed) {
        this._onMetricsChanged.fire(this.getMetrics());
      }
    } catch { /* ignore */ }
  }

  private loadSession(filePath: string, sessionId: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const firstLine = content.split('\n')[0];
      if (!firstLine) { return; }

      const entry = JSON.parse(firstLine);
      if (entry.kind !== 0) { return; }

      const v = entry.v || {};
      const data: CopilotSessionData = {
        id: sessionId,
        file: filePath,
        title: '',
        model: '',
        maxInputTokens: 0,
        requestCount: 0,
        startTime: v.creationDate || 0,
        lastActive: v.creationDate || 0,
      };

      const selectedModel = v.inputState?.selectedModel?.metadata;
      if (selectedModel) {
        data.model = selectedModel.id || selectedModel.name || '';
        data.maxInputTokens = selectedModel.maxInputTokens || 0;
      }

      const requests = v.requests || [];
      data.requestCount = requests.length;
      if (requests.length > 0) {
        const firstReq = requests[0];
        if (firstReq?.message?.text) {
          data.title = firstReq.message.text.slice(0, 40).replace(/\n/g, ' ');
        }
      }

      const lines = content.split('\n');
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) { continue; }
        try {
          const lineEntry = JSON.parse(lines[i]);
          if (lineEntry.kind === 1 && lineEntry.v) {
            data.requestCount++;
            data.lastActive = Math.max(data.lastActive, lineEntry.v.timestamp || data.lastActive);
            if (!data.title && lineEntry.v.message?.text) {
              data.title = lineEntry.v.message.text.slice(0, 40).replace(/\n/g, ' ');
            }
          }
        } catch { continue; }
      }

      this.sessions.set(sessionId, data);
    } catch { /* ignore */ }
  }

  private watchFile(filePath: string, sessionId: string) {
    if (this.fileWatchers.has(filePath)) { return; }
    try {
      const watcher = fs.watch(filePath, () => {
        setTimeout(() => {
          this.loadSession(filePath, sessionId);
          this.activeSessionId = sessionId;
          this._onMetricsChanged.fire(this.getMetrics());
        }, 300);
      });
      this.fileWatchers.set(filePath, watcher);
    } catch { /* ignore */ }
  }

  private watchDirectory() {
    if (!this.chatSessionsDir) { return; }
    try {
      this.dirWatcher = fs.watch(this.chatSessionsDir, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl') && eventType === 'rename') {
          const fullPath = path.join(this.chatSessionsDir, filename);
          if (fs.existsSync(fullPath)) {
            const sessionId = path.basename(filename, '.jsonl');
            this.loadSession(fullPath, sessionId);
            this.watchFile(fullPath, sessionId);
            this.activeSessionId = sessionId;
            this._onMetricsChanged.fire(this.getMetrics());
          }
        }
      });
    } catch { /* ignore */ }
  }
}
