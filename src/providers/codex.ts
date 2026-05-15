import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AIProvider } from './base';
import { ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';

const MAX_TRACKED_SESSION_FILES = 200;
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

interface CodexSessionData {
  id: string;
  file: string;
  title: string;
  model: string;
  cwd: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  cachedInputTokens: number;
  contextWindowUsed: number;
  contextWindowMax: number;
  messageCount: number;
  startTime: number;
  lastActive: number;
}

export class CodexProvider extends AIProvider {
  readonly toolId = 'codex';
  readonly displayName = 'Codex';
  readonly extensionIds = ['openai.chatgpt', 'openai.codex'];
  readonly capabilities: ProviderCapabilities = {
    hasTokenMetrics: true,
    hasModelInfo: true,
    hasContextWindow: true,
    hasMultiSession: true,
  };

  private sessions: Map<string, CodexSessionData> = new Map();
  private activeSessionId = '';
  private codexDir: string;
  private sessionIndex: Map<string, { title: string; updatedAt: number }> = new Map();
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private fileOffsets: Map<string, number> = new Map();
  private partialLines: Map<string, string> = new Map();
  private dirWatchers: fs.FSWatcher[] = [];
  private watchedDirs: Set<string> = new Set();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pollTimer: NodeJS.Timeout | undefined;
  private workspacePath = '';

  constructor(private context: vscode.ExtensionContext) {
    super();
    this.codexDir = path.join(os.homedir(), '.codex');
  }

  start(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.workspacePath = workspaceFolders[0].uri.fsPath.toLowerCase();
    }

    if (!fs.existsSync(this.codexDir)) { return; }

    this.loadSessionIndex();
    this.scanRecentSessions();
    this.watchSessionDirs();

    this.pollTimer = setInterval(() => {
      this.loadSessionIndex();
      this.scanRecentSessions();
      this.watchSessionDirs();
    }, 10000);
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
      .filter(s => this.isCurrentWorkspace(s.cwd))
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
    const isRecentlyActive = Date.now() - active.lastActive < ACTIVE_WINDOW_MS;
    return {
      toolId: this.toolId, displayName: this.displayName,
      isActive: this.isExtensionActive() || isRecentlyActive,
      lastUpdated: active.lastActive || 0,
      model: active.model || undefined,
      inputTokens: active.totalInputTokens,
      outputTokens: active.totalOutputTokens,
      cacheReadTokens: active.cachedInputTokens,
      contextWindowUsed: active.contextWindowUsed,
      contextWindowMax: active.contextWindowMax || 258400,
      activityCount: active.messageCount,
      sessionStartTime: active.startTime || undefined,
      activeTimeMs: active.startTime ? Date.now() - active.startTime : 0,
      sessions: this.getSessions(),
      activeSessionId: this.activeSessionId,
    };
  }

  dispose(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); }
    this.fileWatchers.forEach(w => w.close());
    this.dirWatchers.forEach(w => w.close());
    this.debounceTimers.forEach(t => clearTimeout(t));
    this._onMetricsChanged.dispose();
  }

  private normalizeFsPath(fsPath: string): string {
    return fsPath.replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase();
  }

  private isCurrentWorkspace(cwd: string): boolean {
    if (!cwd || !this.workspacePath) { return true; }
    return this.normalizeFsPath(cwd) === this.normalizeFsPath(this.workspacePath);
  }

  private getActiveSession(): CodexSessionData | undefined {
    const workspaceSessions = Array.from(this.sessions.values())
      .filter(s => this.isCurrentWorkspace(s.cwd));

    if (this.activeSessionId) {
      const found = workspaceSessions.find(s => s.id === this.activeSessionId);
      if (found) { return found; }
    }
    let latest: CodexSessionData | undefined;
    for (const s of workspaceSessions) {
      if (!latest || s.lastActive > latest.lastActive) { latest = s; }
    }
    if (latest) { this.activeSessionId = latest.id; }
    return latest;
  }

  private loadSessionIndex() {
    const indexPath = path.join(this.codexDir, 'session_index.jsonl');
    if (!fs.existsSync(indexPath)) { return; }
    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      for (const line of content.split('\n')) {
        if (!line.trim()) { continue; }
        try {
          const entry = JSON.parse(line);
          if (entry.id && entry.thread_name) {
            this.sessionIndex.set(entry.id, {
              title: entry.thread_name,
              updatedAt: new Date(entry.updated_at).getTime() || 0,
            });
          }
        } catch { continue; }
      }
    } catch { /* ignore */ }
  }

  private scanRecentSessions() {
    const sessionsDir = path.join(this.codexDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) { return; }

    const files = this.collectSessionFiles(sessionsDir);
    let changed = false;
    for (const item of files) {
      const sessionId = this.extractSessionId(path.basename(item.file));
      if (!sessionId) { continue; }
      if (!this.sessions.has(sessionId)) {
        this.loadSession(item.file, sessionId);
        changed = true;
      }
      if (!this.fileWatchers.has(item.file)) {
        this.watchFile(item.file, sessionId);
      }
    }
    if (changed) {
      this._onMetricsChanged.fire(this.getMetrics());
    }
  }

  private collectSessionFiles(sessionsDir: string): { file: string; mtimeMs: number }[] {
    const collected: { file: string; mtimeMs: number }[] = [];
    const years = this.safeReadDirs(sessionsDir).filter(d => /^\d{4}$/.test(d.name));

    for (const year of years) {
      const months = this.safeReadDirs(path.join(sessionsDir, year.name)).filter(d => /^\d{2}$/.test(d.name));
      for (const month of months) {
        const days = this.safeReadDirs(path.join(sessionsDir, year.name, month.name)).filter(d => /^\d{2}$/.test(d.name));
        for (const day of days) {
          const dayDir = path.join(sessionsDir, year.name, month.name, day.name);
          for (const file of this.safeReadFiles(dayDir)) {
            if (!file.name.endsWith('.jsonl')) { continue; }
            collected.push({
              file: path.join(dayDir, file.name),
              mtimeMs: file.mtimeMs,
            });
          }
        }
      }
    }

    return collected
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, MAX_TRACKED_SESSION_FILES);
  }

  private safeReadDirs(dir: string): fs.Dirent[] {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory());
    } catch {
      return [];
    }
  }

  private safeReadFiles(dir: string): { name: string; mtimeMs: number }[] {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isFile())
        .map(d => {
          const fullPath = path.join(dir, d.name);
          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(fullPath).mtimeMs;
          } catch { /* ignore */ }
          return { name: d.name, mtimeMs };
        });
    } catch {
      return [];
    }
  }

  private extractSessionId(filename: string): string | undefined {
    const match = filename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/);
    return match ? match[1] : undefined;
  }

  private loadSession(filePath: string, sessionId: string) {
    const data: CodexSessionData = {
      id: sessionId, file: filePath, title: '', model: '', cwd: '',
      totalInputTokens: 0, totalOutputTokens: 0, cachedInputTokens: 0,
      contextWindowUsed: 0, contextWindowMax: 0,
      messageCount: 0, startTime: 0, lastActive: 0,
    };

    const indexEntry = this.sessionIndex.get(sessionId);
    if (indexEntry) {
      data.title = indexEntry.title;
      data.lastActive = indexEntry.updatedAt;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) { continue; }
        try {
          const entry = JSON.parse(line);
          this.processEntry(entry, data);
        } catch { continue; }
      }
      this.fileOffsets.set(filePath, Buffer.byteLength(content, 'utf8'));
      this.partialLines.set(filePath, '');
    } catch { return; }

    try {
      const stat = fs.statSync(filePath);
      if (!data.lastActive) { data.lastActive = stat.mtimeMs; }
      if (!data.startTime) { data.startTime = stat.birthtimeMs || stat.mtimeMs; }
    } catch { /* ignore */ }

    this.sessions.set(sessionId, data);
  }

  private processEntry(entry: any, data: CodexSessionData) {
    const type = entry.type;
    const payload = entry.payload || {};
    const timestamp = entry.timestamp;

    if (timestamp) {
      const t = new Date(timestamp).getTime();
      if (t && !isNaN(t)) {
        if (!data.startTime) { data.startTime = t; }
        data.lastActive = Math.max(data.lastActive, t);
      }
    }

    if (type === 'session_meta') {
      if (payload.cwd) { data.cwd = payload.cwd; }
      if (payload.timestamp) {
        const t = new Date(payload.timestamp).getTime();
        if (t && !isNaN(t) && !data.startTime) { data.startTime = t; }
      }
    } else if (type === 'turn_context') {
      if (payload.model) { data.model = payload.model; }
      if (payload.cwd) { data.cwd = payload.cwd; }
    } else if (type === 'response_item') {
      if (payload.role === 'user') {
        data.messageCount++;
        if (!data.title && payload.content) {
          const content = Array.isArray(payload.content) ? payload.content : [];
          for (const c of content) {
            if (c && c.type === 'input_text' && c.text) {
              data.title = c.text.slice(0, 40).replace(/\n/g, ' ');
              break;
            }
          }
        }
      }
    } else if (type === 'event_msg' && payload.info) {
      const usage = payload.info.total_token_usage;
      if (usage) {
        data.totalInputTokens = usage.input_tokens || 0;
        data.totalOutputTokens = usage.output_tokens || 0;
        data.cachedInputTokens = usage.cached_input_tokens || 0;
      }
      const lastUsage = payload.info.last_token_usage;
      if (lastUsage) {
        data.contextWindowUsed = lastUsage.input_tokens || 0;
      }
      if (payload.info.model_context_window) {
        data.contextWindowMax = payload.info.model_context_window;
      }
    } else if (type === 'event_msg' && (payload.type === 'task_started' || payload.type === 'turn_started')) {
      if (payload.model_context_window) {
        data.contextWindowMax = payload.model_context_window;
      }
    }
  }

  private watchFile(filePath: string, sessionId: string) {
    if (this.fileWatchers.has(filePath)) { return; }
    try {
      const watcher = fs.watch(filePath, () => {
        const existing = this.debounceTimers.get(filePath);
        if (existing) { clearTimeout(existing); }
        this.debounceTimers.set(filePath, setTimeout(() => {
          this.readNewContent(filePath, sessionId);
        }, 200));
      });
      this.fileWatchers.set(filePath, watcher);
    } catch { /* ignore */ }
  }

  private readNewContent(filePath: string, sessionId: string) {
    let stat: fs.Stats;
    try { stat = fs.statSync(filePath); } catch { return; }

    const offset = this.fileOffsets.get(filePath) || 0;
    if (stat.size <= offset) { return; }

    const stream = fs.createReadStream(filePath, { start: offset, encoding: 'utf8' });
    let rawData = '';
    stream.on('data', (chunk) => { rawData += chunk.toString(); });
    stream.on('end', () => {
      this.fileOffsets.set(filePath, stat.size);
      let session = this.sessions.get(sessionId);
      if (!session) {
        session = {
          id: sessionId, file: filePath, title: '', model: '', cwd: '',
          totalInputTokens: 0, totalOutputTokens: 0, cachedInputTokens: 0,
          contextWindowUsed: 0, contextWindowMax: 0,
          messageCount: 0, startTime: 0, lastActive: 0,
        };
        this.sessions.set(sessionId, session);
      }

      const text = (this.partialLines.get(filePath) || '') + rawData;
      const lines = text.split('\n');
      this.partialLines.set(filePath, lines.pop() || '');

      for (const line of lines) {
        if (!line.trim()) { continue; }
        try {
          const entry = JSON.parse(line);
          this.processEntry(entry, session);
        } catch { continue; }
      }

      this.activeSessionId = sessionId;
      this._onMetricsChanged.fire(this.getMetrics());
    });
    stream.on('error', () => {});
  }

  private watchSessionDirs() {
    const sessionsDir = path.join(this.codexDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) { return; }

    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const date = new Date(now.getTime() - i * 86400000);
      const dayDir = path.join(sessionsDir, String(date.getFullYear()),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'));
      this.watchDayDirectory(dayDir);
    }
  }

  private watchDayDirectory(dayDir: string) {
    if (!fs.existsSync(dayDir) || this.watchedDirs.has(dayDir)) { return; }
    try {
      const watcher = fs.watch(dayDir, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl') && eventType === 'rename') {
          const fullPath = path.join(dayDir, filename);
          if (fs.existsSync(fullPath)) {
            const sessionId = this.extractSessionId(filename);
            if (sessionId && !this.sessions.has(sessionId)) {
              this.loadSession(fullPath, sessionId);
              this.watchFile(fullPath, sessionId);
              this.activeSessionId = sessionId;
              this._onMetricsChanged.fire(this.getMetrics());
            }
          }
        }
      });
      this.watchedDirs.add(dayDir);
      this.dirWatchers.push(watcher);
    } catch { /* ignore */ }
  }
}
