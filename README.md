# AI Usage Tracker

A VS Code extension that automatically detects and tracks usage metrics for all AI coding tools in your editor.

一个 VS Code 扩展，自动检测并追踪编辑器中所有 AI 编程工具的使用指标。

## Features

- **Auto-detection** — Automatically scans and identifies all installed AI extensions
- **Real-time metrics** — Token usage, context window, cache stats, session time
- **Multi-session tracking** — Switch between conversations with per-session metrics
- **Progress bar** — Visual context window usage in the status bar
- **Side panel dashboard** — Detailed breakdown with 7-day usage trends
- **Extension icons** — Displays actual extension icons from your installed tools

## Supported AI Tools

| Tool | Metrics Available |
|------|-------------------|
| Claude Code | Full tokens, model, cache, context window |
| Kilo Code | Full tokens, model, cache |
| GitHub Copilot | Activity count, usage time |
| Codex | Activity count, usage time |
| Cody | Activity count, usage time |
| Tabnine | Activity count, usage time |
| Codeium | Activity count, usage time |
| Cursor | Activity count, usage time |
| Amazon Q | Activity count, usage time |
| Gemini | Activity count, usage time |

Any other AI extension is auto-detected and tracked with basic activity metrics.

## Installation

### From VSIX (Local)

```bash
code --install-extension ai-usage-tracker-0.3.0.vsix
```

### From Source

```bash
git clone https://github.com/yzy1129/AI-Usage-Tracker.git
cd AI-Usage-Tracker
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Usage

After installation and reload:

1. **Status Bar** (bottom) — Shows model name, context progress bar, token counts, active AI tools
2. **Side Panel** (Activity Bar icon) — Click the AI icon for the full dashboard
3. **Session Switching** — Use the dropdown in each tool's card to switch between conversations

## Screenshots

<!-- TODO: Add screenshots -->

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package
npx @vscode/vsce package --allow-missing-repository
```

## Architecture

```
src/
├── extension.ts          — Entry point, orchestrator
├── types.ts              — TypeScript interfaces
├── constants.ts          — AI extension registry, model limits
├── providers/
│   ├── base.ts           — Abstract AIProvider class
│   ├── claude-code.ts    — Claude Code (JSONL file watcher)
│   ├── kilo-code.ts      — Kilo Code (SQLite via Python)
│   ├── github-copilot.ts — GitHub Copilot (activity detection)
│   ├── codex.ts          — Codex (activity detection)
│   └── generic.ts        — Generic provider for auto-detected tools
├── services/
│   ├── detection.ts      — Auto-detect installed AI extensions
│   ├── aggregator.ts     — Combine metrics from all providers
│   └── persistence.ts    — Historical data storage (30-day rolling)
└── ui/
    ├── status-bar.ts     — Compact status bar with progress bar
    └── webview-panel.ts  — Side panel dashboard (WebviewView)
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)
