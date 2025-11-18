# Browse

A TypeScript-based web automation tool built with Stagehand, consisting of a CLI (`wb`) and a server daemon (`wbd`) that communicate via file sockets.

## Overview

Browse is a monorepo project that provides automated web browsing capabilities through two main components:

- **`wb`** (CLI): Command-line interface for interacting with the browsing daemon
- **`wbd`** (Daemon): Server daemon that performs web automation using Stagehand and Browserbase
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

```bash
Usage: wb [options] [command]

Options:
  -s, --session [name]     Name of the session to use: default is 'default'
                           (default: "default")
  -h, --help               display help for command

Commands:
  sessions                 List all sessions
  delete                   Delete a session
  runtime                  Get the runtime of the current tab
  dump [options]           Dump the current tab (max 8196 characters)
  go <url>                 Go to a URL
  interact <instructions>  Interact with the current tab
  observe                  Observe the current tab
  tab                      Manage browser tabs
  help [command]           display help for command
```


You first want to create a new, and then work from there.
you can have multiple tabs in a session, they share cookies, local storage, and other browser state.
Otherwise you can work with another session by specifying the `--session` option.

```bash
Usage: wb tab [options] [command]

Manage browser tabs

Options:
  -h, --help          display help for command

Commands:
  new <name> <url>    Create a new tab
  close <name>        Close a tab
  list                List all tabs
  current             Get the current tab
  set-current <name>  Set the current tab
  help [command]      display help for command
```
