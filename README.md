<p align="center">
  <img src="build/icon.png" width="110" alt="Tiger logo" />
</p>

<h1 align="center">Tiger</h1>

<p align="center">
  A free, local-first API client with a frosted glass interface.<br/>
  Your collections are plain text files on disk. No cloud, no account, no lock-in.
</p>

---

Tiger is an offline API client in the spirit of [Bruno](https://www.usebruno.com): requests live in a folder you control, in a small text format (`.tiger`) that diffs cleanly and reviews like code. On top of that it adds a glass UI with light and dark themes, imports from the tools you already use, and an MCP server so AI assistants can drive your collections.

## Features

- **Local-first collections.** A collection is just a folder of `.tiger` files. Commit it, branch it, review it in pull requests.
- **A real workspace.** Several collections open side by side, collapsible folders, search across requests, create and delete requests in place.
- **Environments.** Named variable sets with `{{variable}}` interpolation everywhere: URL, headers, query, body, auth.
- **Auth built in.** Bearer, Basic, API key (header or query) and OAuth 2.0 client credentials.
- **Import from anywhere.** Postman (v2.0/v2.1), Bruno (.bru folders), OpenAPI 3 / Swagger 2 (JSON or YAML) and Insomnia (v4).
- **Export.** Whole workspace to a Postman v2.1 collection, single requests as `.tiger` or a copy-ready curl command.
- **Code generation.** Turn any request into curl or JavaScript fetch.
- **History.** The last 200 sends with status, timing and size.
- **Company-grade network options.** Proxy (HTTP/HTTPS/SOCKS), SSL verification toggle, redirect policy, configurable timeout.
- **MCP server.** Expose a collection to Claude or any MCP client: list, read and run requests over the Model Context Protocol.
- **Cross-platform.** macOS and Windows (Linux builds too) from one Electron codebase.
- **Free.** MIT licensed.

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
```

A `~` prefix disables a line without deleting it. Environments live in an `environments/` folder inside the collection:

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
npm run dev        # launch the app in development
npm test           # run the test suite
npm run package    # build distributables for your platform
```

Open a collection folder from the sidebar, or try `examples/jsonplaceholder` to see the format in action.

## Connect an AI assistant (MCP)

Tiger ships an MCP server that gives AI clients safe, structured access to a collection:

```bash
npm run build:mcp
```

Then register it, for example in Claude Desktop's `claude_desktop_config.json`:

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

The assistant gets four tools: `list_requests`, `list_environments`, `get_request` and `run_request`. Responses come back with status, timing, headers and a pretty-printed body.

## Privacy

Tiger sends anonymous usage analytics by default: app opened, request sent (method and status bucket only) and collection imported (source and count). It never records URLs, hostnames, header values or bodies, and the only identifier is a random app-local id. Turn it off any time in Settings, under Privacy.

## Architecture

```
src/core      Pure TypeScript: format, interpolation, auth, request building,
              response formatting, importers, exporters, codegen. No DOM, no Node.
src/main      Electron main process: windows, file IO, HTTP, settings, history.
src/preload   The narrow, typed IPC bridge.
src/renderer  React UI (glass).
src/mcp       The MCP server (stdio) and its filesystem store.
```

The core is dependency-free and fully unit-tested; the UI and the MCP server are thin layers over it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: tests first, keep core pure, match the existing style.

## License

[MIT](LICENSE)
