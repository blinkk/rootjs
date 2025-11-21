# Root.js Project Overview

Root.js is a full-featured web development tool with a built-in CMS, designed for building modern, performant websites.

## Key Features

- **TSX Rendering**: Uses TSX for server-side rendering and templating.
- **Web Components**: Supports standard Web Components for building UI elements.
- **File Routes**: Intuitive file-based routing system.
- **i18n**: Built-in support for internationalization.
- **CMS**: Integrated Content Management System for managing content.

## Project Structure

The project is a monorepo managed with `pnpm` and `turbo`.

### Packages (`packages/`)

- **@blinkk/root** (`packages/root`): The core framework package.
- **@blinkk/root-cms** (`packages/root-cms`): The CMS integration for Root.js.
- **@blinkk/create-root** (`packages/create-root`): CLI tool to scaffold new Root.js projects.
- **Other Packages**:
  - `eslint-config-root`: Shared ESLint configuration.
  - `rds`: Likely related to data services or storage (needs verification).
  - `root-core`: Core logic/utilities.
  - `root-db`: Database abstraction/layer.
  - `root-form`: Form handling utilities.
  - `root-password-protect`: Middleware/utility for password protection.
  - `root-webui`: UI components or interface for the system.

### Apps (`apps/`)

- **gci**: An application built within the monorepo.

### Documentation (`docs/`)

Contains documentation for the project, likely powering `rootjs.dev`.

### Examples (`examples/`)

Contains example projects demonstrating various features of Root.js.

## Development

- **Package Manager**: `pnpm`
- **Build System**: `turbo`
- **Linting**: `eslint`

## Best Practices for Agents

When working on this project, please adhere to the following guidelines:

### Package Management

- **Always use `pnpm`**: This project uses `pnpm` for package management. Do not use `npm` or `yarn`.
- **Install dependencies**: Run `pnpm install` at the root to install dependencies for all packages.

### Build & Test

- **Use Turbo**: Use `turbo run build` or `turbo run test` to run tasks across the monorepo efficiently.
- **Dev Server**: Use `pnpm dev` in specific package or app directories for development.

### Version Control & Contributions

- **Changesets**: If your changes require a release (version bump), you must create a changeset. Run `pnpm changeset` and follow the prompts.
- **Commit Messages**: Follow the conventional commit format (e.g., `feat: add new feature`, `fix: resolve issue`).
- **Linting**: Ensure code passes linting rules by running `pnpm lint`.

### Documentation

- **Update Docs**: If you change functionality, check if `docs/` needs updating. The documentation is a Root.js app itself.
- **Comment Style**: All comments should end in punctuation. Use block comments to describe interfaces and their fields. Avoid adding superfluous comments.
- **Comment Requirements**: When creating new classes, hooks, or components that have medium-to-complex functionality, ensure you write at least a brief block comment describing what it is for. For complex functionality, provide an example of how to use it in the comment.

## Contribution

Refer to `CONTRIBUTING.md` for guidelines on contributing to the project.
