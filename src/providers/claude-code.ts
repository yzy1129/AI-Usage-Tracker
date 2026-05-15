import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AIProvider } from './base';
import { ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';
import { getContextLimit } from '../constants';

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
  readonly displayName = 'Claude Code';
  readonly extensionIds = ['anthropic.claude-code'];
  readonly capabilities: ProviderCapabilities = {
    hasTokenMetrics: true,
    hasModelInfo: true,
    hasContextWindow: true,
    hasMultiSession: true,
  };

  private sessions: Map<string, SessionData> = new Map();
  private activeSessionId = '';
  private sessionDir: string | undefined;
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private fileOffsets: Map<string, number> = new Map();
  private partialLines: Map<string, string> = new Map();
  private dirWatcher: fs.FSWatcher | undefined;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    super();
  }

  start(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {return;}

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const encoded = encodeProjectPath(workspacePath);
    const baseDir = path.join(os.homedir(), '.claude', 'projects', encoded);

    if (!fs.existsSync(baseDir)) {return;}
    this.sessionDir = baseDir;
    this.scanSessions();
    this.watchDirectory();
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
        isActive: false, lastUpdated: Date.now(),
        activityCount: 0, activeTimeMs: 0,
        sessions: this.getSessions(), activeSessionId: this.activeSessionId,
      };
    }
    const contextMax = active.model ? getContextLimit(active.model) : 200000;
    return {
      toolId: this.toolId, displayName: this.displayName,
      isActive: true, lastUpdated: Date.now(),
      model: active.model || undefined,
      inputTokens: active.totalInputTokens,
      outputTokens: active.totalOutputTokens,
      cacheCreationTokens: active.totalCacheCreation,
      cacheReadTokens: active.totalCacheRead,
      contextWindowUsed: active.lastInputTokens,
      contextWindowMax: contextMax,
      activityCount: active.messageCount,
      sessionStartTime: active.startTime || undefined,
      activeTimeMs: active.startTime ? Date.now() - active.startTime : 0,
      sessions: this.getSessions(),
      activeSessionId: this.activeSessionId,
    };
  }

  dispose(): void {
    this.fileWatchers.forEach(w => w.close());
    this.debounceTimers.forEach(t => clearTimeout(t));
    if (this.dirWatcher) { this.dirWatcher.close(); }
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
    if (!this.sessionDir) {return;}
    let files: string[];
    try {
      files = fs.readdirSync(this.sessionDir).filter(f => f.endsWith('.jsonl'));
    } catch { return; }

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    for (const file of files) {
      const fullPath = path.join(this.sessionDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < dayAgo) {continue;}
        this.loadSession(fullPath);
        this.watchFile(fullPath);
      } catch { continue; }
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
    if (!this.sessionDir) {return;}
    try {
      this.dirWatcher = fs.watch(this.sessionDir, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl') && eventType === 'rename') {
          const fullPath = path.join(this.sessionDir!, filename);
          if (fs.existsSync(fullPath) && !this.fileWatchers.has(fullPath)) {
            this.loadSession(fullPath);
            this.watchFile(fullPath);
            this.activeSessionId = path.basename(fullPath, '.jsonl');
            this._onMetricsChanged.fire(this.getMetrics());
          }
        }
      });
    } catch {}
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
    } catch {}
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
