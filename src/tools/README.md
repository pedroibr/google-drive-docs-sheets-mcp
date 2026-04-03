# Tools

This directory contains the MCP tool definitions for the Google Docs, Sheets, Slides, and Drive server. Tools are organized into domain-specific folders, each with its own router (`index.ts`) that registers its tools with the server.

## Architecture

```
tools/
├── index.ts       # Top-level router — delegates to each domain
├── docs/          # Google Docs API operations
├── drive/         # Google Drive file and folder management
├── slides/        # Google Slides presentation operations
├── sheets/        # Google Sheets operations
└── utils/         # Cross-cutting workflow utilities
```

Each domain folder contains:

- **`index.ts`** — A router that registers all tools in the domain
- **`README.md`** — Documentation of the domain and its tools
- **Individual tool files** — One file per tool, each exporting a `register(server)` function

## Tool Design Rules

- Public schemas should stay flat and explicit where possible.
- Cross-field validation belongs in runtime handler logic, not in complex schema composition.
- Tool responses should return stable text content with embedded payload data, not ad hoc prose.
- Public tool names should remain stable unless an intentional breaking rename is planned.

## Domains

| Domain              | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| [docs](./docs/)     | Read, write, format, and comment on Google Documents                    |
| [drive](./drive/)   | Search, create, move, copy, rename, and delete files and folders        |
| [slides](./slides/) | Create, inspect, update, and preview Google Slides presentations         |
| [sheets](./sheets/) | Read, write, append, format, validate, and manage spreadsheets          |
| [utils](./utils/)   | Markdown conversion and other cross-cutting workflows                   |

## Adding a New Tool

1. Create a new file in the appropriate domain folder (e.g., `docs/myNewTool.ts`)
2. Export a `register(server: FastMCP)` function that calls `server.addTool({...})`
3. Import and call it from the domain's `index.ts` router
