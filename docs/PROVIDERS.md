# Provider Data Sources

This document records what each provider can read and what it cannot read. The dashboard should display unavailable metrics as `未读取`.

## Codex

Data source:

```text
~/.codex/sessions/<year>/<month>/<day>/*.jsonl
~/.codex/session_index.jsonl
```

Readable metrics:

- Model from `turn_context.payload.model`
- Workspace path from `session_meta.payload.cwd` or `turn_context.payload.cwd`
- Total input/output/cache token usage from `event_msg.payload.info.total_token_usage`
- Current turn context usage from `event_msg.payload.info.last_token_usage.input_tokens`
- Context-window limit from `model_context_window`
- Session title from `session_index.jsonl` or the first user message

Notes:

- The provider scans recent session files and watches active day directories.
- Sessions are filtered to the current workspace when `cwd` is available, including multi-root workspaces.
- Codex is attached to the installed `openai.chatgpt` or `openai.codex` extension card and then enriched with local history data.

## Claude Code

Data source:

```text
~/.claude/projects/<encoded-workspace>/*.jsonl
```

Readable metrics:

- Model
- Input and output tokens
- Cache creation and cache read tokens
- Session title and message count
- Context-window estimate based on known model limits

Notes:

- The provider reads the latest local session files for the current workspace and supports multi-root workspaces.

## Kilo Code

Data source:

```text
~/.local/share/kilo/kilo.db
~/Library/Application Support/kilo/kilo.db
%APPDATA%/Kilo/kilo.db
%LOCALAPPDATA%/Kilo/kilo.db
```

Readable metrics:

- Model and provider id
- Input and output tokens
- Cache read/write tokens
- Session title, update time, and message count

Notes:

- The provider reads SQLite data through an available local Python runtime (`py -3`, `python3`, or `python` depending on platform).
- The provider lists the latest local Kilo sessions instead of only the current day.

## GitHub Copilot

Data source:

```text
%APPDATA%/Code/User/workspaceStorage/*/chatSessions/*.jsonl
```

Readable metrics:

- Selected model metadata when available
- Selected model max input tokens when available
- Chat request count
- Session title and update time

Limitations:

- Token and context-window metrics are not exposed through the parsed local chat metadata.

## Generic AI Extensions

Data source:

```text
VS Code extension metadata and activation state
```

Readable metrics:

- Extension display name
- Basic active/inactive status
- Approximate activity count and active time

Limitations:

- No reliable token, model, context-window, or conversation-history data.
