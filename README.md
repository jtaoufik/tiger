<p align="center">
  <img src="build/icon.png" width="110" alt="Tiger logo" />
</p>

<h1 align="center">Tiger</h1>

<p align="center">
  Tiger is a free, open source, git-native API client. A local-first, account-free Postman alternative with a built-in MCP server.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="macOS and Windows" />
  <img src="https://img.shields.io/badge/version-0.3.0-orange" alt="v0.3.0" />
  <a href="https://buymeacoffee.com/tigerapi"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00.svg?logo=buymeacoffee&logoColor=black" alt="Buy me a coffee" /></a>
  <a href="https://www.linkedin.com/in/taoufik-jabbari"><img src="https://img.shields.io/badge/LinkedIn-Taoufik%20Jabbari-0A66C2?logo=linkedin&logoColor=white" alt="Taoufik Jabbari on LinkedIn" /></a>
</p>

---

## Download

Get the latest macOS and Windows builds from the [**releases page**](https://github.com/jtaoufik/tiger/releases/latest), or visit [the website](https://jtaoufik.github.io/tiger/). Builds are not yet code-signed, so on macOS right-click the app and choose Open the first time.

---

Tiger is an open source API client where every request is a plain `.tiger` text file on disk. Commit your collections, branch them, and review API changes in pull requests the same way you review code. No account required. No cloud sync. No lock-in.

On top of the git-friendly storage model, Tiger adds a glass UI with light and dark themes, a full importer suite, an MCP server so AI assistants (Claude, Cursor) can run requests directly, and a request chaining system to capture response values into variables for the next call.

## Why Tiger

- **Collections as plain text in Git.** A collection is a folder of `.tiger` files. Diff them, branch them, and review API changes in pull requests. Every field is human-readable.
- **No account, fully offline, local-first.** Tiger never phones home for your data. Everything lives in a folder you own.
- **MCP server for AI assistants.** Claude, Cursor, and any MCP-compatible assistant can list, read, and run requests from your collection without leaving the chat. Tiger is the only MCP API client built this way from the ground up.
- **Environments and secrets.** Named variable sets with `{{variable}}` interpolation in URLs, headers, query params, bodies, and auth fields. Secret variables are masked in the UI.
- **Request chaining.** Capture values from a response (status code, header, or a JSON path like `body.data[0].id`) and write them into environment variables for the next request.
- **Dynamic variables.** `{{$uuid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, and `{{$randomInt}}` are re-evaluated on every send.
- **OAuth 2.0, proxy, client certificates (mTLS).** Client credentials grant, Bearer, Basic, and API key auth. HTTP/HTTPS/SOCKS proxy support. Custom CA bundles and client certificate authentication via PEM pair or PFX/PKCS12 file.
- **GraphQL.** Dedicated body type with a separate variables pane.
- **SOAP and XML.** Send raw XML bodies for SOAP/WS-* APIs the same way you would for REST.
- **JSON prettify and minify.** Format button and syntax highlighting in the editor and response panel, with Pretty/Raw and word-wrap toggles.
- **Collection runner.** Run every request in a collection or folder sequentially with live pass/fail verdicts from your script tests, capture chaining between requests, and a stop button.
- **Performance runs.** Fire N requests with a configurable concurrency level and get back min, max, avg, p50, and p95 timings.
- **Multipart and file upload.** multipart/form-data bodies mix text fields and file rows with a per-row file picker; file paths live in the .tiger format as @file: values.
- **Response power tools.** Search inside any response with Cmd/Ctrl+F (match cycling and highlights), preview HTML responses in a sandboxed frame, and view image responses inline.
- **Keyboard-first.** A shortcuts overlay on Cmd/Ctrl+/, tab cycling, close-tab, quick-create, and focus-URL shortcuts. Inline rename (double-click or F2) and drag-and-drop to move requests between folders.
- **Import and export Postman, OpenAPI, and more.** Import a Postman v2.0/v2.1 export, an Insomnia v4 export, a Bruno folder, an OpenAPI 3 / Swagger 2 spec, or a pasted curl command. Export collections back to Postman v2.1 or OpenAPI 3.0, and single requests as `.tiger` or curl.
- **Code generation.** Turn any request into a curl command or a JavaScript fetch snippet.
- **Cookie jar.** Persist cookies between sends and sessions, with automatic cross-origin stripping on redirects.

## Tiger vs Postman vs Bruno

| | Tiger | Postman | Bruno |
|---|---|---|---|
| Open source | Yes | No | Yes |
| Collections as plain text in Git | Yes (`.tiger`) | No | Yes (`.bru`) |
| No account required | Yes | No | Yes |
| Built-in MCP server | Yes | No | No |
| Request chaining (captures) | Yes | Yes | Yes |
| Dynamic variables | Yes | Yes | Partial |
| OAuth 2.0 | Yes | Yes | Yes |
| Client certificates (mTLS) | Yes | Yes | No |
| GraphQL | Yes | Yes | Yes |
| SOAP / XML | Yes | Yes | Yes |
| Performance runner | Yes | Yes | No |
| Collection runner with test assertions | Yes | Paid tiers | Limited |
| Multipart file upload | Yes | Yes | Yes |
| Offline, local-first | Yes | Partial | Yes |

## The `.tiger` format

One request per file. Readable in any editor, friendly to git:

```
meta {
  name: Create post
  seq: 2
}

post {
  url: {{baseUrl}}/posts
}

headers {
  Content-Type: application/json
  ~X-Debug: 1
}

body:json {
  { "title": "Hello from Tiger" }
}

auth:bearer {
  token: {{token}}
}

capture {
  postId: body.id
}
```

A `~` prefix disables a line without deleting it. The `capture` block writes response values into environment variables for the next request in the chain. Environments live in an `environments/` subfolder:

```
meta {
  name: production
}

vars {
  baseUrl: https://api.example.com
  token: abc123
}
```

## Getting started

```bash
npm install
npm run dev        # launch the app in development mode
npm test           # run the test suite
npm run package    # build distributables for your platform
```

Open a collection folder from the sidebar, or try `examples/jsonplaceholder` to see the format in action.

## Connect an AI assistant (MCP)

Tiger ships an MCP server that gives AI clients safe, structured access to a collection. Build it once:

```bash
npm run build:mcp
```

Then register it in your AI client's config. For Claude Desktop, add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tiger": {
      "command": "node",
      "args": ["/path/to/tiger/out/mcp/server.mjs", "/path/to/your/collection"]
    }
  }
}
```

The assistant gets four tools: `list_requests`, `list_environments`, `get_request`, and `run_request`. Every response includes the status code, timing, response headers, and a pretty-printed body. Your collection stays on disk; nothing is sent to any third party.

## Privacy

Tiger sends anonymous usage analytics by default: app opened, request sent (method and status bucket only), and collection imported (source and count). It never records URLs, hostnames, header values, or bodies. The only identifier is a random app-local ID. Turn it off any time in Settings under Privacy.

## Architecture

```
src/core      Pure TypeScript: format, interpolation, auth, request building,
              response formatting, captures, importers, exporters, codegen.
              No DOM, no Node dependency. Fully unit-tested.
src/main      Electron main process: windows, file IO, HTTP, settings, history.
src/preload   The narrow, typed IPC bridge.
src/renderer  React UI (glass).
src/mcp       The MCP server (stdio) and its filesystem store.
```

The core is dependency-free and fully unit-tested. The UI and the MCP server are thin layers on top of it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: tests first, keep core pure, match the existing style.

## Support

Tiger is free and open source, built and maintained on personal time. If it saves you from a paid plan or just makes your day a little easier, you can [buy me a coffee](https://buymeacoffee.com/tigerapi). Find me on [LinkedIn](https://www.linkedin.com/in/taoufik-jabbari) (Taoufik Jabbari). It funds new features and keeps the project independent. Thank you.

## License

MIT. See [LICENSE](LICENSE).
