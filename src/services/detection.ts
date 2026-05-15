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
    const aiKeywords = ['ai', 'copilot', 'assistant', 'llm', 'gpt', 'chat', 'code-completion', 'autocomplete'];

    for (const ext of vscode.extensions.all) {
      if (knownIds.has(ext.id)) {continue;}
      const pkg = ext.packageJSON;
      if (!pkg) {continue;}

      const name = (pkg.displayName || pkg.name || '').toLowerCase();
      const desc = (pkg.description || '').toLowerCase();
      const cats: string[] = pkg.categories || [];

      const isAI = aiKeywords.some(kw => name.includes(kw) || desc.includes(kw))
        || cats.some((c: string) => c.toLowerCase().includes('machine learning') || c.toLowerCase().includes('ai'));

      if (isAI && ext.isActive) {
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
