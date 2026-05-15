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

  constructor(private context: vscode.ExtensionContext) {}

  detectAndStart(): AIProvider[] {
    for (const def of KNOWN_AI_EXTENSIONS) {
      const isInstalled = def.extensionIds.some(id => !!vscode.extensions.getExtension(id));
      const alwaysLoad = def.toolId === 'claude-code' || def.toolId === 'kilo-code';

      if (isInstalled || alwaysLoad) {
        const factory = SPECIALIZED_FACTORIES[def.toolId];
        const provider = factory
          ? factory(this.context, def)
          : new GenericAIProvider(this.context, def);
        provider.start();
        this.providers.push(provider);
      }
    }

    this.scanUnknownAIExtensions();
    return this.providers;
  }

  private scanUnknownAIExtensions() {
    const knownIds = new Set(KNOWN_AI_EXTENSIONS.flatMap(d => d.extensionIds));

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
      if (knownIds.has(ext.id)) {continue;}
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

      if (hasAISignal && ext.isActive) {
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
      }
    }
  }

  getProviders(): AIProvider[] {
    return this.providers;
  }

  dispose(): void {
    for (const p of this.providers) { p.dispose(); }
    this.providers = [];
  }
}
