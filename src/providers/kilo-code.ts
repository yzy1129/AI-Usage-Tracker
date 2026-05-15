import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { AIProvider } from './base';
import { ProviderCapabilities, ProviderMetrics, SessionInfo } from '../types';

interface KiloSession {
  id: string;
  title: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  messageCount: number;
  startTime: number;
  lastActive: number;
}

export class KiloCodeProvider extends AIProvider {
  readonly toolId = 'kilo-code';
  readonly displayName = 'Kilo Code';
  readonly extensionIds = ['kilocode.kilo-code'];
  readonly capabilities: ProviderCapabilities = {
    hasTokenMetrics: true,
    hasModelInfo: true,
    hasContextWindow: false,
    hasMultiSession: true,
  };

  private sessions: KiloSession[] = [];
  private activeSessionId = '';
  private pollTimer: NodeJS.Timeout | undefined;
  private dbPath: string;

  constructor(private context: vscode.ExtensionContext) {
    super();
    this.dbPath = path.join(os.homedir(), '.local', 'share', 'kilo', 'kilo.db');
  }

  start(): void {
    if (!fs.existsSync(this.dbPath) && !this.isExtensionInstalled()) {return;}
    this.readMetrics();
    this.pollTimer = setInterval(() => this.readMetrics(), 5000);
  }

  getSessions(): SessionInfo[] {
    return this.sessions.map(s => ({
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

  private readMetrics() {
    const script = `
import sqlite3, json, sys
db = sqlite3.connect(sys.argv[1])
c = db.cursor()
c.execute("""
  SELECT s.id, s.title, s.time_created, s.time_updated,
    (SELECT COUNT(*) FROM message m WHERE m.session_id=s.id AND json_extract(m.data,'$.role')='assistant') as msg_count,
    (SELECT json_extract(m2.data,'$.modelID') FROM message m2 WHERE m2.session_id=s.id AND json_extract(m2.data,'$.role')='assistant' ORDER BY m2.time_created DESC LIMIT 1) as model,
    (SELECT json_extract(m3.data,'$.providerID') FROM message m3 WHERE m3.session_id=s.id AND json_extract(m3.data,'$.role')='assistant' ORDER BY m3.time_created DESC LIMIT 1) as provider,
    (SELECT SUM(json_extract(m4.data,'$.tokens.input')) FROM message m4 WHERE m4.session_id=s.id AND json_extract(m4.data,'$.role')='assistant') as total_input,
    (SELECT SUM(json_extract(m5.data,'$.tokens.output')) FROM message m5 WHERE m5.session_id=s.id AND json_extract(m5.data,'$.role')='assistant') as total_output,
    (SELECT SUM(json_extract(m6.data,'$.tokens.cache.read')) FROM message m6 WHERE m6.session_id=s.id AND json_extract(m6.data,'$.role')='assistant') as cache_read,
    (SELECT SUM(json_extract(m7.data,'$.tokens.cache.write')) FROM message m7 WHERE m7.session_id=s.id AND json_extract(m7.data,'$.role')='assistant') as cache_write
  FROM session s
  WHERE s.time_updated > (strftime('%s','now')-86400)*1000
  ORDER BY s.time_updated DESC
  LIMIT 20
""")
rows = c.fetchall()
db.close()
result = []
for r in rows:
    result.append({"id":r[0],"title":r[1] or "","start":r[2] or 0,"last":r[3] or 0,
      "count":r[4] or 0,"model":r[5] or "","provider":r[6] or "",
      "input":r[7] or 0,"output":r[8] or 0,"cache_read":r[9] or 0,"cache_write":r[10] or 0})
print(json.dumps(result))
`;

    execFile('python', ['-c', script, this.dbPath], { timeout: 8000 }, (err, stdout) => {
      if (err || !stdout.trim()) {return;}
      try {
        const rows = JSON.parse(stdout.trim());
        this.sessions = rows.map((r: any) => ({
          id: r.id, title: r.title, model: r.model, provider: r.provider,
          inputTokens: r.input, outputTokens: r.output,
          cacheRead: r.cache_read, cacheWrite: r.cache_write,
          messageCount: r.count, startTime: r.start, lastActive: r.last,
        }));
        if (!this.activeSessionId && this.sessions.length > 0) {
          this.activeSessionId = this.sessions[0].id;
        }
        this._onMetricsChanged.fire(this.getMetrics());
      } catch {}
    });
  }

  getMetrics(): ProviderMetrics {
    const active = this.sessions.find(s => s.id === this.activeSessionId) || this.sessions[0];
    if (!active) {
      return {
        toolId: this.toolId, displayName: this.displayName,
        isActive: false, lastUpdated: 0,
        activityCount: 0, activeTimeMs: 0,
        sessions: this.getSessions(), activeSessionId: this.activeSessionId,
      };
    }
    return {
      toolId: this.toolId, displayName: this.displayName,
      isActive: this.isExtensionActive() || active.messageCount > 0,
      lastUpdated: active.lastActive || 0,
      model: active.model ? `${active.model} (${active.provider})` : undefined,
      inputTokens: active.inputTokens,
      outputTokens: active.outputTokens,
      cacheCreationTokens: active.cacheWrite,
      cacheReadTokens: active.cacheRead,
      activityCount: active.messageCount,
      sessionStartTime: active.startTime || undefined,
      activeTimeMs: active.lastActive && active.startTime ? active.lastActive - active.startTime : 0,
      sessions: this.getSessions(),
      activeSessionId: this.activeSessionId,
    };
  }

  dispose(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); }
    this._onMetricsChanged.dispose();
  }
}
