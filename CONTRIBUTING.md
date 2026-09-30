# Contributing to Tiger

Thanks for taking the time to contribute.

## Ground rules

- **Tests first.** Every change to `src/core` lands with unit tests. Run `npm test` before opening a PR; everything must be green.
- **Keep the core pure.** Nothing under `src/core` may touch the DOM, Node APIs or Electron. If a feature needs IO, put the IO in `src/main` and the logic in `src/core`.
- **Small, typed IPC.** New main-process capabilities go through `src/preload/index.ts` with explicit types on both ends.
- **Match the style.** Prettier is configured; `npm run format` before committing. No new dependencies without a good reason.

## Setting up

```bash
npm install
npm run dev        # app with hot reload
npm run test:watch # tests in watch mode
npm run typecheck  # strict TS across all processes
```

## Project map

| Path           | What lives there                                      |
| -------------- | ----------------------------------------------------- |
| `src/core`     | Format, interpolation, auth, build, importers, codegen |
| `src/main`     | Electron main: windows, file IO, HTTP, settings        |
| `src/preload`  | The typed IPC bridge                                   |
| `src/renderer` | React UI                                               |
| `src/mcp`      | MCP server (stdio)                                     |
| `test/`        | Vitest suites mirroring `src/`                         |
| `e2e/`         | Playwright suites that launch the built Electron app   |

## Pre-commit checks

A pre-commit hook runs automatically before every commit, enforcing typecheck and test pass. The hook is set up on `npm install` via the `prepare` script. If a commit fails, fix the errors and try again.

You can also run checks manually:
```bash
npm run typecheck  # TypeScript strict check
npm test           # Vitest suite
npm run test:e2e   # builds, then drives the real Electron app with Playwright (e2e/)
```

The end-to-end suite runs every journey against a temp copy of `examples/jsonplaceholder` and a local HTTP server it starts itself; the app runs with `TIGER_E2E=1`, which blocks any non-loopback request, so it never touches the internet. On Linux without a display, wrap it: `xvfb-run -a npm run test:e2e`.

## Reporting bugs

Open an issue with the request that reproduces it (a `.tiger` snippet is perfect), what you expected, and what happened instead.
