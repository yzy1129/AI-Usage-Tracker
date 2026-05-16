# Architecture

AI Usage Tracker is structured around provider-specific collectors, shared aggregation, and two UI surfaces.

## Runtime Flow

```text
DetectionService
  -> AIProvider instances
  -> AggregatorService
  -> StatusBarUI
  -> DashboardPanel
  -> PersistenceService
```

## Core Modules

### `src/extension.ts`

Activates the extension, creates services, wires metric events, registers commands, and starts persistence.

### `src/services/detection.ts`

Discovers known AI tools and active unknown AI-like extensions. Specialized providers are used when a tool has readable local data. Generic providers are used for basic activity tracking. Manual refresh triggers a provider-level rescan instead of a UI-only redraw.

### `src/providers/*`

Providers are responsible for one tool family. They parse local metadata, watch relevant files, and expose normalized `ProviderMetrics`.

### `src/services/aggregator.ts`

Combines provider metrics into an `AggregatedMetrics` object. The UI consumes this normalized shape and does not need to know provider-specific storage formats.

### `src/services/persistence.ts`

Stores rolling local snapshots for recent activity summaries. Daily history is rebuilt from snapshot deltas so the timeline reflects accumulated activity instead of only the last observed counters. This is extension-local history, not uploaded telemetry.

### `src/ui/status-bar.ts`

Shows a compact status bar summary and a detailed tooltip for each readable AI tool.

### `src/ui/webview-panel.ts`

Renders the activity bar dashboard, provider cards, token summaries, context-window progress, session dropdowns, and seven-day trends. The webview is protected with a CSP and limited resource roots.

## Provider Contract

Every provider extends `AIProvider` and implements:

- `start()`
- `getMetrics()`
- `dispose()`
- optional `getSessions()`
- optional `switchSession(sessionId)`

Provider implementations should hide parsing details and return missing metrics as absent values instead of guessed numbers.

## Privacy Boundary

The extension reads local files and VS Code extension metadata. It should not send metrics or session data to external services. Any future provider that needs a different data source must document the behavior before implementation.
