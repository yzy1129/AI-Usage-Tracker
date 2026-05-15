import { AIToolId } from './types';

export interface AIExtensionDef {
  toolId: AIToolId;
  extensionIds: string[];
  displayName: string;
  icon: string;
  color: string;
}

export const KNOWN_AI_EXTENSIONS: AIExtensionDef[] = [
  { toolId: 'claude-code', extensionIds: ['anthropic.claude-code'], displayName: 'Claude Code for VS Code', icon: '🤖', color: '#c4956a' },
  { toolId: 'github-copilot', extensionIds: ['github.copilot', 'github.copilot-chat'], displayName: 'GitHub Copilot', icon: '✈️', color: '#6366f1' },
  { toolId: 'codex', extensionIds: ['openai.chatgpt', 'openai.codex'], displayName: 'Codex', icon: '🧠', color: '#10b981' },
  { toolId: 'kilo-code', extensionIds: ['kilocode.kilo-code'], displayName: 'Kilo Code', icon: '⚡', color: '#f59e0b' },
  { toolId: 'cody', extensionIds: ['sourcegraph.cody-ai'], displayName: 'Cody', icon: '🔍', color: '#ff6b6b' },
  { toolId: 'tabnine', extensionIds: ['tabnine.tabnine-vscode'], displayName: 'Tabnine', icon: '⭐', color: '#6c5ce7' },
  { toolId: 'codeium', extensionIds: ['codeium.codeium'], displayName: 'Codeium', icon: '💎', color: '#09c184' },
  { toolId: 'cursor', extensionIds: ['anysphere.cursor'], displayName: 'Cursor', icon: '🖱️', color: '#7c3aed' },
  { toolId: 'amazon-q', extensionIds: ['amazonwebservices.amazon-q-vscode'], displayName: 'Amazon Q', icon: '📦', color: '#ff9900' },
  { toolId: 'gemini', extensionIds: ['google.geminicodeassist'], displayName: 'Gemini', icon: '💫', color: '#4285f4' },
];

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-7': 200000,
  'claude-sonnet-4-6': 200000,
  'claude-sonnet-4-5': 200000,
  'claude-haiku-4-5': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'gpt-4o': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o3': 200000,
  'mimo': 128000,
};

export function getContextLimit(model: string): number {
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.includes(key)) {
      return limit;
    }
  }
  return 200000;
}
