## Project Structure

### Packages (`packages/`)

- **@blinkk/root** (`packages/root`): The core framework package.
- **@blinkk/root-cms** (`packages/root-cms`): The CMS integration for Root.js.

### Documentation (`docs/`)

Contains documentation for the project, powering `rootjs.dev`.

### Examples (`examples/`)

Contains example projects demonstrating various features of Root.js.

## Development

- **Package Manager**: `pnpm`
- **Build System**: `turbo`
- **Linting**: `eslint`

## Best Practices for Agents

### UI Development

- Avoid manually importing custom element definitions (these are collected by Root.js during the build process).

### Version Control & Contributions

- **Commit Messages**: Follow the conventional commit format. Use `feat` for new features, `fix` for bug fixes, `ci` for github actions workflows, `chore` for general cleanups / style tweaks / etc. Avoid other prefixes and don't include the package name (bad: `feat(root-cms): lorem ipsum`, good: `feat: lorem ipsum`).
- **Changesets**: Run `pnpm changeset` when a change is worth mentioning in the changelog. Skip minor bug fixes and style changes. Use "patch" versioning only, and a single-line message matching the first line of the commit message.
- **Linting**: Run `pnpm lint` and ensure it passes.

### Code Conventions

- **Comments**: All comments (block and inline) MUST end in punctuation. Use block comments to describe interfaces and their fields, and to briefly describe new classes, hooks, and components. For very complex functionality, include a usage example. Avoid superfluous comments.

### PR Instructions

- **Title**: Use the first line of the commit message.
- **Model Name**: Include the model name in the description, e.g. "Generated with <App> (<Model Name>)".
