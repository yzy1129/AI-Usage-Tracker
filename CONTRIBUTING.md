# Contributing

Thanks for taking the time to improve AI Usage Tracker.

## Development Setup

```bash
git clone https://github.com/yzy1129/AI-Usage-Tracker.git
cd AI-Usage-Tracker
npm install
npm run compile
```

Open the repository in VS Code and press `F5` to start the Extension Development Host.

## Working on Providers

Each AI tool integration lives in `src/providers/` and implements the `AIProvider` interface from `src/providers/base.ts`.

Provider changes should:

- Read only local data that the tool already stores on disk or exposes through VS Code APIs.
- Avoid sending prompts, responses, metrics, or session metadata to external services.
- Return explicit `undefined` or empty values when a metric is not available.
- Document the data source and limitations in `docs/PROVIDERS.md`.
- Keep parsing resilient to malformed or partial local files.

## Pull Requests

Before opening a pull request:

```bash
npm run check
```

Include the following in the PR description:

- What changed.
- Which providers or UI surfaces are affected.
- How you tested the change.
- Any known limitations or data-source assumptions.

## Style

- Use TypeScript and the existing provider/service/UI structure.
- Keep provider-specific parsing inside the provider module.
- Keep UI text concise and explicit when data is unavailable.
- Do not commit `node_modules`, `out`, or packaged `.vsix` files.

## Reporting Issues

When reporting an issue, include:

- OS and VS Code version.
- Extension version.
- AI tool involved.
- Whether the issue affects status bar, dashboard, session dropdown, or provider detection.
- A redacted sample of the local metadata shape if parsing is involved.
