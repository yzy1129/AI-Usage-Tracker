# AI Usage Tracker

AI Usage Tracker is a VS Code extension for monitoring AI coding tools from one place. It shows the active model, context-window usage, token usage, cache usage, session history, and recent activity for supported tools.

The extension reads local editor and tool history only. It does not upload prompts, responses, token metrics, or session metadata to any external service.

## Features

- Automatic detection of popular AI coding extensions.
- Per-tool dashboard cards for model, context window, input tokens, output tokens, cache reads, and conversation activity.
- Codex history import from local `~/.codex/sessions/**/*.jsonl` files, including session dropdowns.
- Claude Code and Kilo Code session tracking with token and model metadata where available.
- Status bar summary for currently active AI tools and their models.
- Side panel dashboard with session switching and seven-day activity trends.
- Generic activity tracking for other active AI-like VS Code extensions.

## Supported Tools

| Tool | Model | Tokens | Context Window | Sessions | Data Source |
| --- | --- | --- | --- | --- | --- |
| Codex | Yes | Yes | Yes | Yes | `~/.codex/sessions` JSONL history |
| Claude Code | Yes | Yes | Yes | Yes | `~/.claude/projects` JSONL history |
| Kilo Code | Yes | Yes | Partial | Yes | Local Kilo SQLite database |
| GitHub Copilot | Partial | No | No | Yes | VS Code chat session metadata |
| Cody, Tabnine, Codeium, Cursor, Amazon Q, Gemini | Basic | No | No | No | Extension activation/activity signals |
| Unknown AI extensions | Basic | No | No | No | Extension activation/activity signals |

Some tools do not expose token or context-window data locally. In those cases the dashboard explicitly shows `未读取` instead of inventing metrics.

## Installation

### From Source

```bash
git clone https://github.com/yzy1129/AI-Usage-Tracker.git
cd AI-Usage-Tracker
npm install
npm run compile
```

Open the folder in VS Code and press `F5` to launch an Extension Development Host.

### From VSIX

```bash
npm install
npm run package
code --install-extension ai-usage-tracker-0.4.0.vsix
```

## Usage

After installing or reloading VS Code:

1. Check the status bar for the active AI tool models and aggregate token totals.
2. Open the `AI Usage` activity bar view for the full dashboard.
3. Use each tool card's session dropdown to switch between detected conversation histories.
4. Run `AI Tracker: Refresh Metrics` from the Command Palette if a newly created session is not visible yet.

For Codex, the extension scans recent local history files under `~/.codex/sessions`, filters them to the current workspace when `cwd` metadata is present, and keeps watching active session files for updates.

## Project Structure

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── ARCHITECTURE.md
│   └── PROVIDERS.md
├── src/
│   ├── extension.ts
│   ├── constants.ts
│   ├── types.ts
│   ├── providers/
│   │   ├── base.ts
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── generic.ts
│   │   ├── github-copilot.ts
│   │   └── kilo-code.ts
│   ├── services/
│   │   ├── aggregator.ts
│   │   ├── detection.ts
│   │   └── persistence.ts
│   └── ui/
│       ├── status-bar.ts
│       └── webview-panel.ts
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── SECURITY.md
├── package.json
└── tsconfig.json
```

## Development

```bash
npm install
npm run compile
npm run watch
```

Useful commands:

```bash
npm run check
npm run package
```

The extension entry point is `src/extension.ts`. Providers implement the `AIProvider` contract from `src/providers/base.ts`, and aggregated metrics flow through `src/services/aggregator.ts` into the status bar and dashboard webview.

## Privacy

AI Usage Tracker reads local files and VS Code extension metadata to compute usage metrics. The extension does not send collected data over the network. If a provider needs a local tool-specific data source, the path and behavior should be documented in `docs/PROVIDERS.md`.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

## License

This project is licensed under the [MIT License](LICENSE).
