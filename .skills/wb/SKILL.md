---
name: wb
description: Use the wb CLI to browse the web, search, read pages, and interact with websites. Use when the user asks to look something up online, visit a website, extract content from a page, or interact with web elements.
allowed-tools: Bash(wb *)
---

# wb — Web Browsing CLI

`wb` provides web browsing through a shared daemon session. Use it to search the web, read pages, and interact with websites.

## Session Setup

If no session is running (`wb tab list` fails), create one:

```bash
wb session create -c ~/cookies.json -d
```

This loads saved cookies and opens a visible browser window.

If a session is misbehaving (commands hang, errors), delete and recreate:

```bash
wb session delete
wb session create -c ~/cookies.json -d
```

Only do this if commands are failing — it kills all open tabs.

## Important: Shared Session

You are using the **default session** which may be shared with other agents. Always:

1. **Create a tab** with a unique name before browsing
2. **Close your tab** when you're done
3. Never close tabs you didn't create

Use a descriptive tab name that identifies your task (e.g., `search-react-hooks`, `read-docs-api`).

## Quick Start

```bash
# Create a tab and navigate to a page
wb tab new <tab-name> <url>

# Read page content
wb tab dump <tab-name>

# Close when done
wb tab close <tab-name>
```

## Searching the Web

Use Google search to find information:

```bash
wb tab new my-search "https://www.google.com/search?q=your+search+query"
wb tab dump my-search
# Read the results
wb tab close my-search

# Possibly navigate to a result as needed
wb tab new read-result <result-url>
wb tab dump read-result
wb tab close read-result
```

Always URL-encode the search query (replace spaces with `+`).

## Commands Reference

### Tab Management

```bash
wb tab list                           # List all open tabs
wb tab new <name> <url>               # Create tab and navigate
wb tab close <name>                   # Close tab (always clean up!)
wb tab go <name> <url>                # Navigate tab to a new URL
```

### Reading Content

```bash
wb tab dump <name>                    # Dump page as markdown (default limit: 8192 chars)
wb tab dump <name> -o 8192            # Dump starting at offset 8192 (pagination)
wb tab dump <name> -h                 # Dump as raw HTML
wb tab dump <name> -l 16384           # Dump with larger limit
```

The dump output includes a header:

```
---
url: https://example.com
offset: 0
limit: 8192
remaining: 4521
---
```

Use `remaining` to know if there's more content. Paginate with `-o <offset>` if needed.

### Interacting with Pages

```bash
wb tab act <name> -a <instructions>       # Perform an action (click, type, etc.)
wb tab observe <name> <instructions>      # List available actions matching instructions
```

`act` uses AI to perform browser actions like clicking links, filling forms, pressing buttons. If `act` fails, try `observe` first to see what actions are available, then `act` on a more specific instruction.

Examples:

```bash
wb tab act my-tab -a "click the Sign In button"
wb tab act my-tab -a "type hello into the search box"
wb tab observe my-tab "find all navigation links"
```

## Tips

- **Dump is paginated**: if `remaining > 0` in the header, use `-o` to get the next chunk
- **Act with observe fallback**: `act` internally falls back to `observe` + `act` if direct action fails
- **SVGs are stripped**: dump output automatically removes SVG noise
- **Google search**: always use `https://www.google.com/search?q=...` for web searches
