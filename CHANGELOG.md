# Changelog

## [0.4.1] - 2026-05-16

### Fixed
- Fixed case-sensitive VS Code extension ID matching, which could split one installed tool into duplicate cards
- Fixed Claude Code for VS Code being shown separately from the Claude history provider
- Fixed Codex detection so the installed `openai.chatgpt` extension uses the Codex local-history provider
- Dashboard now shows every detected installed AI tool, even before readable token/history data exists

## [0.4.0] - 2026-05-16

### Added
- Full Codex local history reader for `~/.codex/sessions/**/*.jsonl`
- Codex model, token, cache, context-window, and session dropdown support
- Open-source project documentation under `docs/`
- GitHub issue and pull request templates
- Contributing and security documentation

### Changed
- Codex provider now loads even when no Codex VS Code extension is installed
- Dashboard cards now show per-tool model, token, and context status explicitly
- Status bar tooltip now reports each readable AI tool separately
- README updated for public open-source usage and provider documentation

## [0.3.0] - 2026-05-15

### Added
- Dynamic scanning of all AI extensions (not limited to preset list)
- Multi-session tracking with dropdown switcher for Claude Code and Kilo Code
- Real extension icons displayed in the dashboard panel
- Generic provider for auto-detected unknown AI tools
- Support for Codex, Cody, Tabnine, Codeium, Cursor, Amazon Q, Gemini

### Changed
- Redesigned dashboard UI with card layout, gradient progress bar, and clearer typography
- Refactored to modular provider architecture
- Status bar consolidated into single compact item with progress bar

### Removed
- Removed hardcoded Continue and ChatGPT providers (now auto-detected via generic provider)

## [0.2.0] - 2026-05-15

### Added
- Side panel dashboard (WebviewView) with token summary and 7-day trends
- Activity Bar icon for quick access
- Persistence service for historical data (30-day rolling)
- Aggregator service combining all provider metrics
- Detection service for auto-detecting installed AI extensions

### Changed
- Upgraded from single-provider to multi-provider architecture
- All UI labels in Chinese

## [0.1.0] - 2026-05-15

### Added
- Initial release
- Claude Code session tracking via JSONL file watching
- VS Code status bar display: model, context, input/output tokens, cache, message count
- Real-time updates via file system watcher
- Dark/light theme support
