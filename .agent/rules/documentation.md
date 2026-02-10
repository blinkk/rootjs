---
trigger: always_on
---

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
- **Update types**: Use `pnpm types` within Root CMS projects to regenerate types.

### Build & Test

- **Use Turbo**: Use `turbo run build` or `turbo run test` to run tasks across the monorepo efficiently.
- **Dev Server**: Use `pnpm dev` in specific package or app directories for development.
- **Visual Tests**: Always use the `--update` flag with `pnpm run test:visual`.

### UI Development

- Follow existing conventions.
- Avoid manually importing custom element definitions (these are collected by Root.js during the build process).

### Version Control & Contributions

- **Changesets**: If your changes require a release (version bump), you must create a changeset. Run `pnpm changeset` and follow the prompts.
- **Commit Messages**: Follow the conventional commit format (e.g., `feat: add new feature`, `fix: resolve issue`).
- **Linting**: Ensure code passes linting rules by running `pnpm lint`.

### Documentation

- **Comment Style**: All comments MUST end in punctuation. Use block comments to describe interfaces and their fields. Avoid adding superfluous comments. Inline comments MUST also end in punctuation.
- **Comment Requirements**: When creating new classes, hooks, or components, write at least a brief block comment describing what it is for. For very complex functionality, provide an example of how to use it in the comment.

### Coding Conventions

- **Null/Undefined Checks**: When checking if a value is defined (not `undefined` and not `null`), prefer using a helper function like `isDef()` instead of repeating `value !== undefined && value !== null`. This improves readability and maintainability.
- **Conditional Logic Ordering**: Prefer reading conditionals with the positive value first, followed by the default case. For example:

  ```typescript
  // Preferred
  if (isDef(value)) {
    // Normalize or process value
  } else {
    // Set default value
  }

  // Avoid
  if (value === undefined || value === null) {
    // Set default value
  } else {
    // Normalize or process value
  }
  ```

## Contribution

Refer to `CONTRIBUTING.md` for guidelines on contributing to the project.
