# Browse

A TypeScript-based web automation tool built with Stagehand, consisting of a CLI (`wb`) and a server daemon (`wbd`) that communicate via file sockets.

## Overview

Browse is a monorepo project that provides automated web browsing capabilities through two main components:

- **`wb`** (CLI): Command-line interface for interacting with the browsing daemon
- **`wbd`** (Daemon): Server daemon that performs web automation using Stagehand
- **`common`**: Shared TypeScript code and types used by both components

## Prerequisites

- Node.js 20.x or higher
- npm or yarn package manager

## Installation

```bash
npm install
```

## Building

Build the project using the following commands:

```bash
# Build everything (common + workspaces)
npm run build

# Build CLI only
npm run build:cli

# Build daemon only
npm run build:daemon
```

## Development

Run components in development mode with hot reloading:

```bash
# Start daemon in dev mode
npm run dev:wbd

# Run CLI in dev mode (in a separate terminal)
npm run dev:wb
```

## Installing Binaries

To make the `wb` and `wbd` commands available globally on your system:

```bash
npm run install:bins
```

After installation, you can use:
- `wb` command from anywhere
- `wbd` command from anywhere

To uninstall the global commands:

```bash
npm run uninstall:bins
```

## Usage

Most commands accept these global options:

- `-s, --session [name]` — Name of the session to use (default: `default`)
- `-d, --debug` — Enable debug mode (makes the browser visible / not headless)

### Session Management

Sessions live at `~/.config/wb/sessions/{name}/` and hold a Unix socket and browser profile data. Tabs within a session share cookies, local storage, and other browser state. Use `--session` to work with a different session.

```bash
wb session list                          # List all sessions
wb session create [session] [-c file]    # Create a session (optionally load cookies from a JSON file)
wb session delete [session]              # Delete a session
```

### Navigation & Interaction

```bash
wb go <url>                              # Navigate to a URL
wb dump [-h] [-o offset]                 # Dump current tab content (max 8196 chars, use --offset to paginate, --html for raw HTML)
wb interact <instructions>               # Interact with the current tab using natural language
wb runtime                               # Get the runtime in seconds of the current session
```

### Tab Management

```bash
wb tab list                              # List all tabs
wb tab current                           # Get the current tab
wb tab set-current <name>                # Switch to a tab by name
wb tab new <name> <url>                  # Create a new tab and navigate to a URL
wb tab close <name>                      # Close a tab by name
```

### Network Recording

```bash
wb network start                         # Start recording network events
wb network stop [-o file]                # Stop recording and save to file (default: network.json)
```
