# Changelog

All notable changes to Tiger are documented here. The update checker reads
`website/version.json`; keep both in sync when releasing.

## Unreleased

- Response timing breakdown: TTFB (waiting), download and total, with DNS/TCP/TLS phases on the certificate send path
- Large JSON paste and big responses stay responsive (pretty-print and highlighting cap past ~2 MB; cheaper editor validity check)

- Export collections to OpenAPI 3.0 (import already supported OpenAPI and Swagger)
- Pre-request and post-response scripts with assertions and a tests panel
- Collection and folder pages open as tabs; folder-level docs and default auth
- Per-request and per-collection history; background auto-update from GitHub Releases

- Fix: `package.json` license field corrected from "MIT" to "SEE LICENSE IN LICENSE" to match the proprietary LICENSE file
- Fix: `package` script now runs `build:mcp` before `electron-builder` so the MCP server is compiled into shipped builds
- Fix: Added `asarUnpack` for `out/mcp/**` so the MCP server binary is extractable at runtime; added `bin.tiger-mcp` entry
- Fix: Website operatingSystem JSON-LD and stat strip corrected from 3 platforms to 2 (macOS, Windows); FAQ deploy answer updated to reflect only the macOS DMG and Windows installer/portable that are published, with Linux/ZIP noted as available on request

## 0.2.0 · 2026-06-11

- New tiger mascot across app icon, dock and logo
- JSON syntax highlighting in the response panel, with Pretty/Raw and word-wrap toggles
- Command palette: Cmd/Ctrl+K jumps to any request across open collections
- Duplicate requests from the sidebar
- Unresolved `{{variable}}` warning under the URL bar
- Cancel in-flight requests
- Format button and invalid-JSON indicator for JSON bodies
- Unsaved-changes indicator on the Save action
- Resizable sidebar and editor/response split, remembered between sessions
- Update checker: the app detects new releases and shows the changelog
- Settings cleanup: analytics is a single toggle, no manual GA4 credentials

## 0.1.0 · 2026-06-10

First public preview.

- Local-first collections: every request is a plain text `.tiger` file
- Multi-collection workspace with collapsible folders, search, duplicate and delete
- Environments with `{{variable}}` interpolation everywhere
- Auth: OAuth 2.0 client credentials, Bearer, Basic, API key
- Importers: Postman v2.0/v2.1, Insomnia v4, Bruno folders, OpenAPI 3 / Swagger 2
- Postman export, curl and fetch code generation
- Proxy (HTTP/HTTPS/SOCKS), SSL verification toggle, redirect and timeout controls
- History of the last 200 sends
- MCP server: AI clients can list, read and run requests
- Glass UI with light, dark and system themes
- macOS (Apple Silicon and Intel) and Windows (installer and portable) builds
