# AGENTS.md

## Project Overview

**Browse** is a TypeScript monorepo providing automated web browsing via a CLI (`wb`) and a headless browser daemon (`wbd`) that communicate over Unix domain sockets. The daemon wraps [Stagehand](https://github.com/browserbase/stagehand) (a Playwright-based AI browser automation library) to provide AI-powered page interaction alongside standard navigation and content dumping.

## Architecture

```
┌──────────┐   Unix socket    ┌──────────┐    Stagehand/Playwright    ┌─────────┐
│  wb CLI  │ ──────────────── │ wbd      │ ────────-──────────────────│ Browser │
│ (client) │   JSON messages  │ (daemon) │    (Chrome or Lightpanda)  │         │
└──────────┘                  └──────────┘                            └─────────┘
      │                             │
      └── commander CLI             └── Session singleton
          parses commands               manages tabs, pages, cookies,
          sends RPC to daemon           network recording
```

### Communication Protocol

- `wb` spawns `wbd` as a detached child process on session creation
- They communicate via a Unix socket at `~/.config/wb/sessions/<name>/sock`
- Messages are newline-delimited JSON: `{ method: string, params: object }` → `{ result: any } | { error: string }`
- Each `wb` command opens a fresh socket connection, sends one request, reads one response, then disconnects
- The daemon handles one request at a time per connection (no multiplexing)

### Session Lifecycle

1. `wb session create <name>` → spawns `wbd -s <name>` (detached) → daemon creates socket file
2. `wb` commands connect to the socket, send a method call, get a response
3. `wb session delete <name>` → sends `deleteSession` (daemon calls `process.exit(0)`) → removes session directory
4. Session data (Chrome user data dir) persists at `~/.config/wb/sessions/<name>/data/`

## Monorepo Structure

```
browse/
├── common/              # Shared library (@browse/common)
│   ├── types.ts         # Core types: Tab, Action, ActResult, ObserveAction, Cookie, NetworkEvent, SessionMethod, Response
│   ├── error.ts         # Result<T> monad (Ok/Err), BrowserError, prettyString()
│   └── constants.ts     # SESSION_DIR path (~/.config/wb/sessions)
│
├── wb/                  # CLI package (wb binary)
│   └── src/
│       ├── index.ts     # Commander CLI definition — all commands/subcommands
│       ├── controller.ts # BrowserController — static methods wrapping socket RPC calls
│       └── socket.ts    # ClientSocket — connects to daemon, sends JSON, reads response
│
├── wbd/                 # Daemon package (wbd binary)
│   └── src/
│       ├── index.ts     # Entry point — parses args, calls Session.initialize()
│       ├── session.ts   # Session singleton — manages Stagehand, tabs, pages, network recording
│       ├── socket.ts    # ServerSocket — Unix socket server, routes requests to Session.call()
│       ├── types.ts     # Input validation guards (isTabInput, isDumpInput, isActInput, etc.)
│       └── utils.ts     # Safe wrappers around Stagehand/Playwright operations
│
├── benchmarks/          # Performance benchmarks
│   ├── compare.ts       # Chrome vs Lightpanda startup/navigation comparison
│   └── playwright-stagehand.ts # Stagehand-only vs Playwright-CDP latency comparison
│
├── cookie-getter.ts     # Standalone script: launches fresh Chromium for manual cookie export
├── eslint.config.ts     # ESLint config (typescript-eslint, trailing commas enforced)
├── tsconfig.json        # Root TypeScript config
└── package.json         # Workspace root — workspaces: [common, wb, wbd]
```

## Workspaces & Dependencies

| Package | Name | Key Dependencies | Produces |
|---------|------|-----------------|----------|
| `common` | `@browse/common` | (none, just Node types) | Shared types, error handling, constants |
| `wb` | `wb` | `@browse/common`, `commander` | `wb` CLI binary |
| `wbd` | `wbd` | `@browse/common`, `@browserbasehq/stagehand`, `html-to-markdown-node`, `zod` | `wbd` daemon binary |

**Import convention**: Packages import from `@browse/common/types`, `@browse/common/error`, `@browse/common/constants` (subpath exports defined in `common/package.json`).

## Build & Development

```bash
# Install all dependencies
npm install

# Build everything (must build common first — order matters)
npm run build          # runs: build common → build all workspaces

# Build individual packages
npm run build:cli      # common + wb
npm run build:daemon   # common + wbd

# Development mode (hot reload via tsx)
npm run dev:wbd        # daemon
npm run dev:wb         # CLI (separate terminal)

# Install wb/wbd as global commands
npm run install:bins   # npm link for both packages

# Lint
npm run lint
npm run lint:fix
```

**Build order matters**: `common` must be built before `wb` or `wbd` since they depend on `@browse/common` dist output.

## Key Patterns & Conventions

### Error Handling — Result Monad

All operations return `Result<T>` (defined in `common/error.ts`), which is either `Ok<T>` or `Err<BrowserError>`. There are no thrown exceptions in the business logic — errors are propagated via the Result type.

```typescript
const res = await someOperation();
if (res.isErr()) return res;  // propagate error
const value = res.value;      // access Ok value
```

Helper functions: `ok(value)`, `err(message)`, `resultToResponse()`, `responseToResult()`.

### Type Guards

The codebase uses runtime type guards extensively (e.g., `isTab()`, `isSessionMethod()`, `isCookieInput()`) rather than relying on TypeScript's type system alone. This is because data crosses the socket boundary as untyped JSON.

### Session Methods (RPC Interface)

The full list of daemon methods is defined in `common/types.ts` as `SESSION_METHODS`:

| Method | Params | Returns |
|--------|--------|---------|
| `runtimeSeconds` | none | `number` |
| `listTabs` | none | `string[]` |
| `getCurrentTab` | none | `Tab & { tabName }` |
| `setCurrentTab` | `{ tabName }` | `void` |
| `addCookies` | `{ cookies: Cookie[] }` | `void` |
| `newTab` | `{ tabName, url }` | `Tab` |
| `closeTab` | `{ tabName }` | `void` |
| `dump` | `{ html, offset? }` | `string` (max 8196 chars) |
| `go` | `{ url }` | `void` |
| `act` | `{ instructions }` | `{ action, url }` |
| `observe` | `{ instructions }` | `ObserveAction[]` |
| `deleteSession` | none | `void` (daemon exits) |
| `startNetworkRecord` | none | `void` |
| `stopNetworkRecord` | none | `NetworkEvent[]` |

### Adding a New Command

To add a new command/method end-to-end:

1. **`common/types.ts`**: Add the method name to `SESSION_METHODS`, define any new types
2. **`wbd/src/types.ts`**: Add input validation guard if needed
3. **`wbd/src/session.ts`**: Add the implementation as a static method on `Session`, add the case to `Session.call()`
4. **`wbd/src/utils.ts`**: Add safe wrapper if it involves Stagehand/Playwright operations
5. **`wb/src/controller.ts`**: Add a static method on `BrowserController` that calls `send()`
6. **`wb/src/index.ts`**: Add the Commander command definition

### Stagehand Usage

The daemon uses `@browserbasehq/stagehand`. Key points:
- `stagehand.init()` launches the browser
- `stagehand.context.newPage()` creates Playwright pages
- `stagehand.act(instructions, { page })` performs AI-powered actions (with observe+act fallback)
- `stagehand.observe(instructions, { page })` returns available actions with selectors
- Pages use Playwright's API: `page.goto()`, `page.url()`, `page.locator()`, `page.close()`
- Content dumping: gets `body` innerHTML via `page.locator("body").innerHtml()`, strips SVG elements, optionally converts to Markdown via `html-to-markdown-node`
- Cookies are set via CDP: `page.sendCDP("Network.setCookie", cookie)`

### Browser Backends

Two browser backends are supported, selected via `BROWSER` env var:
- **`chrome`** (default): Launches local Chrome via Playwright with a persistent user data directory
- **`lightpanda`**: Connects to a Lightpanda headless browser via CDP websocket on port 9222

### Dump Pagination

`dump` returns at most **8196 characters** at a time. Clients must paginate using the `offset` parameter, incrementing by 8196 each call. The slicing happens in `Session.dump()`: `text.slice(offset, 8196 + offset)`.

## File Locations & State

- **Session data**: `~/.config/wb/sessions/<name>/`
  - `sock` — Unix domain socket file (exists while daemon is running)
  - `data/` — Chrome user data directory (persists cookies, localStorage, etc.)
- **Cookies file**: `cookies.json` at repo root (gitignored) — exported by cookie-getter

## Linting & Style

- ESLint with `typescript-eslint` (strict type-checked config)
- Trailing commas enforced everywhere (arrays, objects, imports, exports, function params)
- `any` types are explicitly allowed (`@typescript-eslint/no-explicit-any: off`)
- Unused variables allowed if prefixed with `_`
- Nullish coalescing (`??`) required over logical OR (`||`)

## Testing

There are no unit tests. The `benchmarks/` directory contains performance comparison scripts:
- `compare.ts` — Chrome vs Lightpanda startup/navigation benchmarks
- `playwright-stagehand.ts` — Stagehand-only vs Playwright-CDP connection latency

Run benchmarks with: `npx tsx benchmarks/compare.ts`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `BROWSER` | Set to `lightpanda` to use Lightpanda instead of Chrome |
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | Required by Stagehand for AI-powered `act`/`observe` operations |

## Common Pitfalls

- **Build order**: Always build `common` before `wb`/`wbd`. Use `npm run build` (not individual workspace builds) to ensure correct order.
- **Stale sockets**: If `wbd` crashes, the socket file may remain. `wb` handles this by detecting stale sockets and re-creating sessions in `ClientSocket.ensureSession()`.
- **Session must exist**: Most `wb` commands require an existing session. Create one first with `wb session create`.
- **Tab required**: `dump`, `go`, `act`, and `observe` all require a current tab. Create one with `wb tab new <name> <url>` first.
- **60-second timeout**: Socket requests timeout after 60 seconds (except `deleteSession` which times out after 100ms since the daemon exits immediately).
