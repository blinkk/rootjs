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

- Follow existing conventions.
- Avoid manually importing custom element definitions (these are collected by Root.js during the build process).

### Version Control & Contributions

- **Changesets**: If your changes require a version bump, you must create a changeset. Run `pnpm changeset` and follow the prompts.
  - **When to create one**: Only create a changeset when the feature or bug fix is important enough to be worth mentioning in the changelog. Never create changesets for minor bug fixes or style changes.
  - **Message format**: The changeset message should be a single line. Use the first line of the git commit message.
  - **Semantic versioning**: Always use "patch" level versioning (never use "minor" or "major").
- **Commit Messages**: Follow the conventional commit format (e.g., `feat: add new feature`, `fix: resolve issue`).
  - Use `feat` for new features, `fix` for bug fixes, `ci` for github actions workflows, `chore` for general cleanups / style tweaks / etc. Avoid other prefixes.
  - Avoid adding the package name in the commit message (bad: `feat(root-cms): lorem ipsum`, good: `feat: lorem ipsum`).
- **Linting**: Ensure code passes linting rules by running `pnpm lint`.

### Code Conventions

- **Comment Style**: All comments MUST end in punctuation. Use block comments to describe interfaces and their fields. Avoid adding superfluous comments. Inline comments MUST also end in punctuation.
- **Comment Requirements**: When creating new classes, hooks, or components, write at least a brief block comment describing what it is for. For very complex functionality, provide an example of how to use it in the comment.

### PR Instructions

- **PR Title**: Use the first line of the git commit message.
- **LLM Model Name**: Include the model name in the PR description, e.g. "Generated with <App> (<Model Name>)".
