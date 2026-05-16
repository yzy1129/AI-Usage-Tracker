import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AIProvider } from './base';
import { AIToolId, ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';
import { calculateObservedDuration, isRecentlyActive } from '../utils/provider-metrics';
import { getWorkspacePaths } from '../utils/workspace';

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
  private chatSessionsDirs: string[] = [];
  private dirWatchers: fs.FSWatcher[] = [];
  private watchedDirs: Set<string> = new Set();
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private fileModifiedAt: Map<string, number> = new Map();
  private pollTimer: NodeJS.Timeout | undefined;
  private workspacePaths: string[] = [];

  constructor(private context: vscode.ExtensionContext) {
    super();
  }

  start(): void {
    if (!this.isExtensionInstalled()) { return; }
    this.workspacePaths = getWorkspacePaths();
    this.findChatSessionsDirs();
    if (this.chatSessionsDirs.length > 0) {
      this.scanSessions();
      this.watchDirectory();
    }

    this.pollTimer = setInterval(() => {
      if (this.chatSessionsDirs.length > 0) {
        this.scanSessions();
      }
    }, 15000);
  }

  refresh(): void {
    if (!this.isExtensionInstalled()) { return; }
    this.workspacePaths = getWorkspacePaths();
    this.findChatSessionsDirs();
    if (this.chatSessionsDirs.length === 0) { return; }
    this.scanSessions();
    this.watchDirectory();
    this._onMetricsChanged.fire(this.getMetrics());
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
    const activeNow = isRecentlyActive(active.lastActive);
    return {
      toolId: this.toolId, displayName: this.displayName,
      isActive: activeNow, lastUpdated: active.lastActive || 0,
      model: active.model || undefined,
      contextWindowMax: active.maxInputTokens || undefined,
      activityCount: active.requestCount,
      sessionStartTime: active.startTime || undefined,
      activeTimeMs: calculateObservedDuration(active.startTime, active.lastActive, activeNow),
      sessions: this.getSessions(),
      activeSessionId: this.activeSessionId,
    };
  }

  dispose(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); }
    this.dirWatchers.forEach(w => w.close());
    this.watchedDirs.clear();
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

  private findChatSessionsDirs() {
    const foundDirs = new Set<string>();

    for (const workspaceStorageDir of this.getWorkspaceStorageRoots()) {
      if (!fs.existsSync(workspaceStorageDir)) { continue; }

      try {
        const dirs = fs.readdirSync(workspaceStorageDir);
        for (const dir of dirs) {
          const chatDir = path.join(workspaceStorageDir, dir, 'chatSessions');
          const workspaceJson = path.join(workspaceStorageDir, dir, 'workspace.json');
          if (!fs.existsSync(chatDir) || !fs.existsSync(workspaceJson)) { continue; }

          const content = fs.readFileSync(workspaceJson, 'utf8');
          const contentLower = process.platform === 'win32' ? content.toLowerCase() : content;
          const matchesCurrentWorkspace = this.workspacePaths.some((workspacePath) => {
            const rawWindowsPath = workspacePath.replace(/\//g, '\\');
            const escapedWindowsPath = workspacePath.replace(/\//g, '\\\\');
            return contentLower.includes(workspacePath)
              || contentLower.includes(rawWindowsPath)
              || contentLower.includes(escapedWindowsPath);
          });

          if (matchesCurrentWorkspace) {
            foundDirs.add(chatDir);
          }
        }
      } catch { /* ignore */ }
    }

    this.chatSessionsDirs = Array.from(foundDirs);
  }

  private getWorkspaceStorageRoots(): string[] {
    const candidates: string[] = [];
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA;
      if (appData) {
        candidates.push(path.join(appData, 'Code', 'User', 'workspaceStorage'));
        candidates.push(path.join(appData, 'Code - Insiders', 'User', 'workspaceStorage'));
      }
    } else if (process.platform === 'darwin') {
      const home = os.homedir();
      candidates.push(path.join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'));
      candidates.push(path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'workspaceStorage'));
    } else {
      const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      candidates.push(path.join(configHome, 'Code', 'User', 'workspaceStorage'));
      candidates.push(path.join(configHome, 'Code - Insiders', 'User', 'workspaceStorage'));
    }

    return candidates.filter((candidate, index) => candidate && candidates.indexOf(candidate) === index);
  }

  private scanSessions() {
    let changed = false;
    for (const chatSessionsDir of this.chatSessionsDirs) {
      if (!fs.existsSync(chatSessionsDir)) { continue; }
      try {
        const files = fs.readdirSync(chatSessionsDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const fullPath = path.join(chatSessionsDir, file);
          const sessionId = path.basename(file, '.jsonl');
          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(fullPath).mtimeMs;
          } catch { /* ignore */ }

          if (this.fileModifiedAt.get(fullPath) !== mtimeMs) {
            this.loadSession(fullPath, sessionId);
            changed = true;
          }
          if (!this.fileWatchers.has(fullPath)) {
            this.watchFile(fullPath, sessionId);
          }
        }
      } catch { /* ignore */ }
    }

    if (changed) {
      this._onMetricsChanged.fire(this.getMetrics());
    }
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

      try {
        this.fileModifiedAt.set(filePath, fs.statSync(filePath).mtimeMs);
      } catch { /* ignore */ }
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
    for (const chatSessionsDir of this.chatSessionsDirs) {
      if (this.watchedDirs.has(chatSessionsDir)) { continue; }
      try {
        const watcher = fs.watch(chatSessionsDir, (eventType, filename) => {
          if (filename && filename.endsWith('.jsonl') && eventType === 'rename') {
            const fullPath = path.join(chatSessionsDir, filename);
            if (fs.existsSync(fullPath)) {
              const sessionId = path.basename(filename, '.jsonl');
              this.loadSession(fullPath, sessionId);
              this.watchFile(fullPath, sessionId);
              this.activeSessionId = sessionId;
              this._onMetricsChanged.fire(this.getMetrics());
            }
          }
        });
        this.watchedDirs.add(chatSessionsDir);
        this.dirWatchers.push(watcher);
      } catch { /* ignore */ }
    }
  }
}
