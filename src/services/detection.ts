import * as vscode from 'vscode';
import { AIProvider } from '../providers/base';
import { ClaudeCodeProvider } from '../providers/claude-code';
import { GitHubCopilotProvider } from '../providers/github-copilot';
import { CodexProvider } from '../providers/codex';
import { KiloCodeProvider } from '../providers/kilo-code';
import { GenericAIProvider } from '../providers/generic';
import { KNOWN_AI_EXTENSIONS, AIExtensionDef } from '../constants';

type ProviderFactory = (ctx: vscode.ExtensionContext, def: AIExtensionDef) => AIProvider;

const SPECIALIZED_FACTORIES: Record<string, ProviderFactory> = {
  'claude-code': (ctx) => new ClaudeCodeProvider(ctx),
  'github-copilot': (ctx) => new GitHubCopilotProvider(ctx),
  'codex': (ctx) => new CodexProvider(ctx),
  'kilo-code': (ctx) => new KiloCodeProvider(ctx),
};

export class DetectionService implements vscode.Disposable {
  private providers: AIProvider[] = [];
  private _onProvidersChanged = new vscode.EventEmitter<AIProvider[]>();
  readonly onProvidersChanged = this._onProvidersChanged.event;
  private activationCheckTimer: NodeJS.Timeout | undefined;
  private loadedExtensionIds = new Set<string>();

  constructor(private context: vscode.ExtensionContext) {}

  detectAndStart(): AIProvider[] {
    for (const def of KNOWN_AI_EXTENSIONS) {
      const installedExtensions = this.getInstalledExtensions(def.extensionIds);

      if (installedExtensions.length > 0) {
        this.addProvider(def, installedExtensions);
      }
    }

    this.scanUnknownAIExtensions();
    this.startActivationWatcher();
    return this.providers;
  }

  private startActivationWatcher() {
    this.activationCheckTimer = setInterval(() => {
      this.checkForNewActivations();
    }, 5000);
  }

  private checkForNewActivations() {
    for (const def of KNOWN_AI_EXTENSIONS) {
      if (def.extensionIds.some(id => this.loadedExtensionIds.has(this.normalizeExtensionId(id)))) {continue;}

      const installedExtensions = this.getInstalledExtensions(def.extensionIds);

      if (installedExtensions.length > 0) {
        this.addProvider(def, installedExtensions);
        this._onProvidersChanged.fire(this.providers);
      }
    }

    if (this.scanUnknownAIExtensions()) {
      this._onProvidersChanged.fire(this.providers);
    }
  }

  private scanUnknownAIExtensions(): boolean {
    let changed = false;
    const knownIds = new Set(KNOWN_AI_EXTENSIONS
      .flatMap(d => d.extensionIds)
      .map(id => this.normalizeExtensionId(id)));

    const aiPatterns = [
      /\bai\b/i, /\bllm\b/i, /\bgpt\b/i, /\bcopilot\b/i,
      /\bchatbot\b/i, /\bcode\s*completion\b/i, /\bautocomplete\b/i,
      /\bai\s*assist/i, /\bai\s*code/i, /\bcode\s*ai\b/i,
      /\blanguage\s*model/i, /\bgenerat(?:ive|e)\s*ai/i,
      /\bai[\s-]*powered/i, /\bml\s*code/i,
    ];

    const excludePatterns = [
      /\bcsv\b/i, /\bpython\b/i, /\blint/i, /\bformat/i,
      /\btheme\b/i, /\bicon\b/i, /\bgit\b/i, /\bdocker\b/i,
      /\bsnippet/i, /\bdebug/i, /\btest/i, /\bsql\b/i,
      /\bcontainer/i, /\bremote/i, /\bssh\b/i,
    ];

    for (const ext of vscode.extensions.all) {
      const extId = this.normalizeExtensionId(ext.id);
      if (this.isSelfExtension(extId)) {continue;}
      if (knownIds.has(extId)) {continue;}
      if (this.loadedExtensionIds.has(extId)) {continue;}
      const pkg = ext.packageJSON;
      if (!pkg) {continue;}

      const name = pkg.displayName || pkg.name || '';
      const desc = pkg.description || '';
      const text = `${name} ${desc}`;
      const cats: string[] = pkg.categories || [];

      const isExcluded = excludePatterns.some(p => p.test(name));
      if (isExcluded) {continue;}

      const hasAISignal = aiPatterns.some(p => p.test(text))
        || cats.some((c: string) => /\bmachine learning\b/i.test(c) || /^ai$/i.test(c));

      if (hasAISignal) {
        const def: AIExtensionDef = {
          toolId: ext.id,
          extensionIds: [ext.id],
          displayName: pkg.displayName || pkg.name || ext.id,
          icon: '🤖',
          color: '#64748b',
        };
        const provider = new GenericAIProvider(this.context, def);
        provider.start();
        this.providers.push(provider);
        this.loadedExtensionIds.add(extId);
        changed = true;
      }
    }

    return changed;
  }

  getProviders(): AIProvider[] {
    return this.providers;
  }

  dispose(): void {
    if (this.activationCheckTimer) { clearInterval(this.activationCheckTimer); }
    for (const p of this.providers) { p.dispose(); }
    this.providers = [];
    this._onProvidersChanged.dispose();
  }

  private normalizeExtensionId(id: string): string {
    return id.toLowerCase();
  }

  private getInstalledExtensions(extensionIds: string[]): vscode.Extension<any>[] {
    const wanted = new Set(extensionIds.map(id => this.normalizeExtensionId(id)));
    return vscode.extensions.all.filter(ext => wanted.has(this.normalizeExtensionId(ext.id)));
  }

  private addProvider(def: AIExtensionDef, installedExtensions: vscode.Extension<any>[]) {
    const factory = SPECIALIZED_FACTORIES[def.toolId];
    const provider = factory
      ? factory(this.context, def)
      : new GenericAIProvider(this.context, def);
    provider.start();
    this.providers.push(provider);

    def.extensionIds.forEach(id => this.loadedExtensionIds.add(this.normalizeExtensionId(id)));
    installedExtensions.forEach(ext => this.loadedExtensionIds.add(this.normalizeExtensionId(ext.id)));
  }

  private isSelfExtension(extensionId: string): boolean {
    const ownId = this.context.extension?.id;
    return !!ownId && extensionId === this.normalizeExtensionId(ownId);
  }
}
