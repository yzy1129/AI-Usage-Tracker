import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AIProvider } from './base';
import { ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';
import { getContextLimit } from '../constants';
import { calculateObservedDuration, isRecentlyActive } from '../utils/provider-metrics';
import { getWorkspacePaths } from '../utils/workspace';

function encodeProjectPath(fsPath: string): string {
  let p = fsPath;
  if (process.platform === 'win32' && /^[A-Z]:/.test(p)) {
    p = p[0].toLowerCase() + p.slice(1);
  }
  return p.replace(/:/g, '-').replace(/[\\/]/g, '-');
}

interface SessionData {
  file: string;
  model: string;
  lastInputTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  messageCount: number;
  startTime: number;
  lastActive: number;
  title: string;
}

export class ClaudeCodeProvider extends AIProvider {
  readonly toolId = 'claude-code';
  readonly displayName = 'Claude Code for VS Code';
  readonly extensionIds = ['anthropic.claude-code'];
  readonly capabilities: ProviderCapabilities = {
    hasTokenMetrics: true,
    hasModelInfo: true,
    hasContextWindow: true,
    hasMultiSession: true,
  };

  private sessions: Map<string, SessionData> = new Map();
  private activeSessionId = '';
  private sessionDirs: string[] = [];
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private fileOffsets: Map<string, number> = new Map();
  private fileModifiedAt: Map<string, number> = new Map();
  private partialLines: Map<string, string> = new Map();
  private dirWatchers: fs.FSWatcher[] = [];
  private watchedDirs: Set<string> = new Set();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    super();
  }

  start(): void {
    const workspacePaths = getWorkspacePaths();
    if (workspacePaths.length === 0) { return; }

    this.sessionDirs = workspacePaths
      .map((workspacePath) => path.join(os.homedir(), '.claude', 'projects', encodeProjectPath(workspacePath)))
      .filter((sessionDir, index, dirs) => fs.existsSync(sessionDir) && dirs.indexOf(sessionDir) === index);

    if (this.sessionDirs.length === 0) { return; }
    this.scanSessions();
    this.watchDirectory();
  }

  refresh(): void {
    const workspacePaths = getWorkspacePaths();
    this.sessionDirs = workspacePaths
      .map((workspacePath) => path.join(os.homedir(), '.claude', 'projects', encodeProjectPath(workspacePath)))
      .filter((sessionDir, index, dirs) => fs.existsSync(sessionDir) && dirs.indexOf(sessionDir) === index);

    if (this.sessionDirs.length === 0) { return; }
    this.scanSessions();
    this.watchDirectory();
    this._onMetricsChanged.fire(this.getMetrics());
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.lastActive - a.lastActive)
      .map(s => ({
        id: path.basename(s.file, '.jsonl'),
        title: s.title || path.basename(s.file, '.jsonl').slice(0, 8),
        startTime: s.startTime,
        lastActive: s.lastActive,
        model: s.model,
        isActive: path.basename(s.file, '.jsonl') === this.activeSessionId,
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
    const contextMax = active.model ? getContextLimit(active.model) : 200000;
    const activeNow = isRecentlyActive(active.lastActive);
    return {
      toolId: this.toolId, displayName: this.displayName,
      isActive: activeNow, lastUpdated: active.lastActive || Date.now(),
      model: active.model || undefined,
      inputTokens: active.totalInputTokens,
      outputTokens: active.totalOutputTokens,
      cacheCreationTokens: active.totalCacheCreation,
      cacheReadTokens: active.totalCacheRead,
      contextWindowUsed: active.lastInputTokens,
      contextWindowMax: contextMax,
      activityCount: active.messageCount,
      sessionStartTime: active.startTime || undefined,
      activeTimeMs: calculateObservedDuration(active.startTime, active.lastActive, activeNow),
      sessions: this.getSessions(),
      activeSessionId: this.activeSessionId,
    };
  }

  dispose(): void {
    this.fileWatchers.forEach(w => w.close());
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.dirWatchers.forEach(w => w.close());
    this.watchedDirs.clear();
    this._onMetricsChanged.dispose();
  }

  private getActiveSession(): SessionData | undefined {
    if (this.activeSessionId) {
      for (const [, s] of this.sessions) {
        if (path.basename(s.file, '.jsonl') === this.activeSessionId) {return s;}
      }
    }
    let latest: SessionData | undefined;
    for (const [, s] of this.sessions) {
      if (!latest || s.lastActive > latest.lastActive) { latest = s; }
    }
    if (latest) { this.activeSessionId = path.basename(latest.file, '.jsonl'); }
    return latest;
  }

  private scanSessions() {
    const recentFiles = this.sessionDirs
      .flatMap((sessionDir) => {
        let files: string[];
        try {
          files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
        } catch {
          return [];
        }

        return files.map(file => {
          const fullPath = path.join(sessionDir, file);
          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(fullPath).mtimeMs;
        } catch {
          // Ignore transient file stat failures while scanning.
        }
          return { file: fullPath, mtimeMs };
        });
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 200);

    for (const item of recentFiles) {
      if (this.fileModifiedAt.get(item.file) !== item.mtimeMs) {
        this.loadSession(item.file);
      }
      this.watchFile(item.file);
    }
  }

  private loadSession(filePath: string) {
    const id = path.basename(filePath, '.jsonl');
    const data: SessionData = {
      file: filePath, model: '', lastInputTokens: 0,
      totalInputTokens: 0, totalOutputTokens: 0,
      totalCacheCreation: 0, totalCacheRead: 0,
      messageCount: 0, startTime: 0, lastActive: 0, title: '',
    };

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) {continue;}
        try {
          const entry = JSON.parse(line);
          this.processEntry(entry, data);
        } catch { continue; }
      }
      this.fileOffsets.set(filePath, Buffer.byteLength(content, 'utf8'));
      this.partialLines.set(filePath, '');
      this.fileModifiedAt.set(filePath, fs.statSync(filePath).mtimeMs);
    } catch { return; }

    this.sessions.set(id, data);
  }

  private processEntry(entry: any, data: SessionData) {
    if (entry.type === 'user' && entry.message?.content) {
      const content = entry.message.content;
      if (Array.isArray(content)) {
        const textBlock = content.find((c: any) => c.type === 'text');
        if (textBlock && !data.title) {
          data.title = textBlock.text.slice(0, 40).replace(/\n/g, ' ');
        }
      } else if (typeof content === 'string' && !data.title) {
        data.title = content.slice(0, 40).replace(/\n/g, ' ');
      }
      if (entry.timestamp) {
        const t = new Date(entry.timestamp).getTime();
        if (!data.startTime) { data.startTime = t; }
        data.lastActive = t;
      }
    }

    if (entry.type === 'assistant' && entry.message?.usage) {
      const usage = entry.message.usage;
      const model = entry.message.model;
      if (model && model !== '<synthetic>') { data.model = model; }
      if (entry.timestamp) {
        const t = new Date(entry.timestamp).getTime();
        if (!data.startTime) { data.startTime = t; }
        data.lastActive = t;
      }
      data.lastInputTokens = usage.input_tokens || 0;
      data.totalInputTokens += usage.input_tokens || 0;
      data.totalOutputTokens += usage.output_tokens || 0;
      data.totalCacheCreation += usage.cache_creation_input_tokens || 0;
      data.totalCacheRead += usage.cache_read_input_tokens || 0;
      data.messageCount++;
    }
  }

  private watchDirectory() {
    for (const sessionDir of this.sessionDirs) {
      if (this.watchedDirs.has(sessionDir)) { continue; }
      try {
        const watcher = fs.watch(sessionDir, (eventType, filename) => {
          if (filename && filename.endsWith('.jsonl') && eventType === 'rename') {
            const fullPath = path.join(sessionDir, filename);
            if (fs.existsSync(fullPath) && !this.fileWatchers.has(fullPath)) {
              this.loadSession(fullPath);
              this.watchFile(fullPath);
              this.activeSessionId = path.basename(fullPath, '.jsonl');
              this._onMetricsChanged.fire(this.getMetrics());
            }
          }
        });
        this.watchedDirs.add(sessionDir);
        this.dirWatchers.push(watcher);
      } catch {
        // Ignore watcher registration failures for provider resilience.
      }
    }
  }

  private watchFile(filePath: string) {
    if (this.fileWatchers.has(filePath)) {return;}
    try {
      const watcher = fs.watch(filePath, () => {
        const existing = this.debounceTimers.get(filePath);
        if (existing) { clearTimeout(existing); }
        this.debounceTimers.set(filePath, setTimeout(() => {
          this.readNewContent(filePath);
        }, 200));
      });
      this.fileWatchers.set(filePath, watcher);
    } catch {
      // Ignore watcher registration failures for provider resilience.
    }
  }

  private readNewContent(filePath: string) {
    let stat: fs.Stats;
    try { stat = fs.statSync(filePath); } catch { return; }

    const offset = this.fileOffsets.get(filePath) || 0;
    if (stat.size <= offset) {return;}

    const stream = fs.createReadStream(filePath, { start: offset, encoding: 'utf8' });
    let data = '';
    stream.on('data', (chunk) => { data += chunk.toString(); });
    stream.on('end', () => {
      this.fileOffsets.set(filePath, stat.size);
      this.fileModifiedAt.set(filePath, stat.mtimeMs);
      const id = path.basename(filePath, '.jsonl');
      const session = this.sessions.get(id);
      if (!session) {return;}

      const text = (this.partialLines.get(filePath) || '') + data;
      const lines = text.split('\n');
      this.partialLines.set(filePath, lines.pop() || '');

      for (const line of lines) {
        if (!line.trim()) {continue;}
        try {
          const entry = JSON.parse(line);
          this.processEntry(entry, session);
        } catch { continue; }
      }

      this.activeSessionId = id;
      this._onMetricsChanged.fire(this.getMetrics());
    });
    stream.on('error', () => {});
  }
}
