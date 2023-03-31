# Root.js Contributing Guide

## Repo Setup

The package manager used to install and link dependencies must be [pnpm](https://pnpm.io/).

To get started:

1. Run `pnpm i` in the main workspace folder.
1. Run `pnpm build` in the main workspace folder.
1. Run `pnpm dev` in any examples folder to start a dev server.
1. If you are developing a root package, you can go into the package's folder and run `pnpm dev` to automatically rebuild whenever you change its code.

## Pull Request Guidelines

- PR title must follow the [commit message convention](./.github/commit-convention.md).
- Any change that should have a changelog entry should have a `changeset` (see "Creating a Changeset" section)

## Creating a Changeset

1. Run `pnpm changeset`
1. Select the package(s) that should include a short message explaining your change using spacebar
1. Select whether the version bump should be Major (breaking changes), Minor (new feature), or Patch (bug fixes)
1. Add the newly created changeset file along with your commit
