# Releasing Root.js

This document describes how Root.js manages branches and releases across major
versions. The goal is to ship a new major without breaking users on the current
one, and without painful merges between stable and bleeding-edge code.

## Long-lived release branches per major version

Keep `main` as the bleeding edge — it tracks the next major version (e.g. v3
while v2 is the current stable). When a new major ships, cut a maintenance
branch named after the previous major (e.g. `2.x` or `release/v2`). That branch
becomes the home for all patch and minor releases of v2 going forward. When v3
is released, cut `3.x` from `main` and `main` moves on toward v4.

So at any given time the repo has:

- `main` — active development for the next major (breaking changes welcome).
- `2.x` — maintenance for the previous major (bug fixes, security patches,
  occasional minor features).
- Older `1.x`, etc. — kept around as long as they are supported.

## Bug fixes flow forward, never backward

The trick that keeps this clean: bug fixes flow *from old to new*, not the
other way. When a bug is fixed in v2:

1. Branch off `2.x`, fix the bug, PR back into `2.x`, release a patch.
2. Cherry-pick (or merge) that commit forward into `main`.

`main` is almost never merged back into `2.x` — that would drag breaking
changes into the stable line. Going forward-only means conflicts are localized
to the specific files the bug touched, and they're resolved once at
cherry-pick time. If the v3 code has refactored that area heavily, sometimes
it's cleaner to reimplement the fix on `main` rather than cherry-pick — that's
fine.

When cherry-picking forward, use `git cherry-pick -x` so the new commit
message references the original. It makes the history much easier to audit
later.

## Pre-releases of the next major

While the next major is cooking on `main`, publish it under an npm dist-tag so
it doesn't clobber `latest`:

```bash
npm publish --tag next
# or --tag beta, --tag alpha, etc.
```

Users opt in with `npm install @blinkk/root@next`. Meanwhile
`npm install @blinkk/root` still gets the current stable. When the new major
is ready to be promoted:

```bash
npm dist-tag add @blinkk/root@3.0.0 latest
```

Use prerelease versions like `3.0.0-beta.1`, `3.0.0-rc.1` so semver-aware
tooling treats them correctly. Changesets has a [pre-release
mode](https://github.com/changesets/changesets/blob/main/docs/prereleases.md)
that handles this for monorepos:

```bash
pnpm changeset pre enter next
# ... merge changesets, version, and publish as usual ...
pnpm changeset pre exit
```

## Practical tips

- **Tag every release** (`v2.4.1`, `v3.0.0-beta.2`) so it's always possible to
  check out exactly what shipped.
- **Protect release branches** in GitHub — require PRs and passing CI on
  `main`, `2.x`, etc.
- **Changelogs per branch.** Changesets already writes per-package
  `CHANGELOG.md` files; each maintenance branch maintains its own history,
  which is exactly what's wanted.
- **Cut the maintenance branch at release time**, not before. The branch
  point should be the commit that was tagged as the final release of that
  major.

## Why this avoids messy merges

The two branches are never trying to converge. They diverge intentionally and
stay diverged; individual fixes are shuttled across the gap as needed. There's
no long-running merge debt, no surprise breaking changes leaking back into the
stable line, and users on each major get a clean release stream.
