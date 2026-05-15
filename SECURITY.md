# Security Policy

## Supported Versions

Security fixes are applied to the latest released version on the `main` branch.

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory or by contacting the maintainer through the repository owner profile.

Do not include sensitive prompts, responses, API keys, tokens, or unredacted local session files in public issues.

## Data Handling

AI Usage Tracker is designed to read local usage metadata and display it inside VS Code. It does not intentionally transmit collected metrics, prompts, responses, or session metadata to external services.

Provider integrations must keep this behavior:

- Local reads only unless a future feature clearly documents and asks for network access.
- No collection of API keys or secrets.
- No uploading of conversation content.
- Robust handling of malformed, partial, or unexpectedly large local history files.
