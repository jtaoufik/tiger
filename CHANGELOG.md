# Changelog

All notable changes to Tiger are documented here. The update checker reads
`website/version.json`; keep both in sync when releasing.

## 0.4.0

- WSDL / SOAP import: pick a `.wsdl` file and each binding operation becomes a POST request with a ready-to-fill SOAP envelope, the correct Content-Type and (SOAP 1.1) SOAPAction header. Supports SOAP 1.1 and 1.2.
- New collection: create an empty collection folder on disk from the welcome screen or the sidebar.
- Linux: first-class builds — AppImage (auto-updating via electron-updater) and a Debian/Ubuntu `.deb`.
- Windows: fixed window resize and maximize, which the acrylic backdrop had blocked. The frosted-glass look now comes entirely from the renderer.
- Response view: a more opaque, readable surface for response bodies while the chrome keeps its frosted look.
- Downloads: the website links straight to GitHub Releases instead of versioned filenames.

## 0.3.1 · 2026-06-12

- Complete tab management: right-click menu (Close / Close others / Close to the right / Close all / Reveal in sidebar), drag-to-reorder, unsaved-change dots, Cmd/Ctrl+1-9 tab jumps, active tab kept in view
- Session restore: open collections, the tab strip and the active tab survive restarts
- Collection runner with live pass/fail from script tests, on collection and folder pages
- multipart/form-data bodies with per-row file upload; curl -F codegen
- Response power tools: Cmd/Ctrl+F search with highlights, sandboxed HTML preview, inline image preview, timing breakdown on hover
- Keyboard shortcuts overlay (Cmd/Ctrl+/), close-tab, tab cycling, quick-create, focus-URL
- Sidebar: inline rename (double-click or F2), duplicate folder, drag requests between folders (moves files on disk)
- Collection and folder pages organized in tabs; Code and Perf are editor tabs
- Windows builds return: install via winget (no SmartScreen prompt) or the direct installer

## 0.3.0 · 2026-06-12

- Now open source under the MIT license
- Pre-request and post-response scripts (sandboxed JS) with assertions and a tests panel
- Collection and folder pages open as tabs; folder-level documentation and default auth, inherited request -> folder -> collection
- Export collections to OpenAPI 3.0 (import already supported OpenAPI and Swagger)
- Response timing breakdown: TTFB (waiting), download and total, with DNS/TCP/TLS phases on the certificate send path
- Large JSON paste and big responses stay responsive (pretty-print and highlighting cap past ~2 MB; cheaper editor validity check)
- Imported client certificates (CA bundle, PEM pair, PFX), persistent cookie jar, dynamic variables, GraphQL body
- Per-request and per-collection history; Lucide icon set; background auto-update from GitHub Releases
- macOS builds are signed and notarized; the `package` script now builds the MCP server and unpacks it from the asar

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
