# Root Agent

The **Root Agent** is an AI-powered workflow designed to automate the end-to-end process of building Root CMS modules from visual designs and managing content.

## Setup

1.  **Configuration**: Ensure the `.cursorrules` file is present in the root of your project. This file instructs the AI assistant on project conventions and capabilities.
2.  **MCP Server**: Ensure the `root-cms` MCP server is running and connected to your editor.
    - Command: `root-cms mcp` (usually handled by your editor's MCP client).

## Usage

You can interact with the Root Agent directly in your editor's chat interface (e.g., Cursor Chat).

### Scenario: Build from Screenshot

1.  **Upload Screenshot**: Drag and drop a design screenshot into the chat.
2.  **Prompt**: Give a high-level command.
    > "Build this module, name it `TemplateFeatureCards`, and add it to the `Pages/index` page."

### What the Agent Does

1.  **Analysis**: It analyzes the screenshot to understand the layout and fields.
2.  **Coding**: It creates the necessary files in `docs/blocks/` or `docs/templates/`:
    - `Schema`: Defines the data structure.
    - `Component`: React code with `useTranslations` and `RichText`.
    - `Styles`: SCSS with CSS modules.
3.  **Integration**: It uses the MCP tools to:
    - Fetch the schema for `Pages`.
    - Fetch the content of `Pages/index`.
    - Append the new `TemplateFeatureCards` block to the page's `modules` list.
    - Save the updated page.

## Workflows

We have defined specific workflows in `.agent/workflows/` to guide the agent:

- **`implement-design.md`**: The standard flow for converting a design to a CMS module.

## Tips

- **Be Specific**: If you have specific naming preferences or existing components to reuse, mention them.
- **Richtext**: The agent knows to use EditorJS format for richtext fields.
- **Review**: Always review the generated code and the CMS content update.
