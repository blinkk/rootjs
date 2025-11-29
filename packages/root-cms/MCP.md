# Root CMS MCP Server

Root CMS includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI assistants (like Claude Desktop, IDEs, etc.) to interact with your CMS content.

## Features

- **List Collections**: View all content collections in your project.
- **Read Documents**: Retrieve content from any document.
- **Save Drafts**: Create or update draft documents.
- **Publish Documents**: Publish content directly.

## Usage

### Claude Desktop Configuration

To use Root CMS with Claude Desktop, add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "root-cms": {
      "command": "npx",
      "args": ["root-cms", "mcp"],
      "cwd": "/path/to/your/root-cms-project"
    }
  }
}
```

Replace `/path/to/your/root-cms-project` with the absolute path to your Root CMS project directory.

### VS Code (GitHub Copilot) Configuration

To use Root CMS with GitHub Copilot in VS Code, add the following to your VS Code `settings.json`:

```json
"github.copilot.mcpServers": {
  "root-cms": {
    "command": "pnpm",
    "args": ["exec", "root-cms", "mcp"],
    "cwd": "/path/to/your/root-cms-project"
  }
}
```

### Running via CLI

You can also run the MCP server directly via the command line. This is primarily useful for testing or for connecting other MCP clients that support stdio.

```bash
pnpm exec root-cms mcp
```

This will start the server and listen for JSON-RPC messages on stdin/stdout.

### Running in Monorepo (Development)

If you are developing within the `rootjs` monorepo, you can run the MCP server using `pnpm`:

```bash
# From the root of the monorepo
pnpm --filter @blinkk/root-cms exec root-cms mcp --cwd ../../examples/cms
```

Or directly from the package directory:

```bash
cd packages/root-cms
node bin/root-cms.js mcp --cwd ../../examples/cms
```

### Using the AI Edit Feature

The `edit_doc` tool allows you to modify content using natural language prompts.

> [!NOTE]
> This feature requires AI to be configured in your `root.config.ts`. Ensure `experiments.ai` is enabled and a model is selected.

**Example Usage:**

1.  **Tool:** `edit_doc`
2.  **Arguments:**
    - `collectionId`: "Pages"
    - `slug`: "index"
    - `prompt`: "Update the hero title to 'Welcome to the Future' and change the primary button link to '/signup'."

The AI will analyze the document's schema and current content, then apply the requested changes to the draft version of the document.

### Available Tools

| Tool                    | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| `list_collections`      | List all collections in the CMS project.                                        |
| `get_collection_schema` | Get the schema for a specific collection (limited support).                     |
| `list_docs`             | List documents in a collection. Supports pagination and mode (draft/published). |
| `get_doc`               | Get a document by slug.                                                         |
| `save_doc`              | Save a draft document.                                                          |
| `publish_doc`           | Publish a document.                                                             |

### Available Resources

- `root-cms://{projectId}/collections`: List of collections.
