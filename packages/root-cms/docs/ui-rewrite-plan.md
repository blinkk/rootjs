# CMS UI rewrite: remove Mantine, move to Tailwind, make it mobile-friendly

Status: **approved direction, reorg pending review**. Branch: `cms-ui-rewrite`.
Edit freely; subagents get pointed at this file.

## Decisions log

| # | Question | Answer |
| --- | --- | --- |
| 1 | Port or redesign? | Mostly a faithful port. Inconsistent spacing, color, and type get normalized onto one token scale (see D2a). |
| 2 | New deps? | Whatever is important, but keep third-party deps to a minimum (see D8). |
| 3 | Branching | Long-lived `cms-ui-rewrite` branch. Other work on main is paused, so no conflict churn. |
| 4 | Gallery | Dev-only route inside the CMS. |
| 5 | `.mantine-*` selectors in custom CSS/themes | Not used. Break freely, no backport. |
| 6 | Folder reorg | Done (D7, `ce52e51e`). |
| 7 | Badge gradients | Keep them: `Badge variant="gradient"` with themeable `--cms-gradient-*` tokens. |
| 8 | Callback naming | Native inputs keep `onChange`; controls whose value isn't a plain string use `onValueChange(value)`. |
| 9 | Dialogs on mobile | Bottom sheets that grow with their content, not full-screen. |
| 10 | Dismissing a confirm | Escape, backdrop and X call `onClose` only, not `onCancel` (as in Mantine). |
| 11 | IconButton tooltips | On by default, showing `label`; `tooltip={false}` opts out. |
| 12 | Tab scroll fade | Not needed. |
| 13 | Select with no matches | Stays closed unless `nothingFound` is set (as in Mantine). |
| 14 | Input look | Closer to Mantine: cool `--cms-input-*` greys, pill chips, no 16px mobile text. Tabs underline in black. |

## Goals

1. Remove `@mantine/*` (core, hooks, modals, notifications, spotlight) and its
   emotion runtime.
2. Rebuild the components that need it with Tailwind.
3. Make every page usable on a phone (down to 375px wide).
4. Keep theming self-documenting: `--cms-*` custom properties are the stable
   contract, and BEM class names are the documented hooks.

Non-goals (unless you say otherwise): a visual redesign, dark mode, replacing
ag-grid or Lexical, and changes to `core/` behavior.

## Where we're starting from

- `ui/`: ~57k lines of TSX, 219 components/pages, 127 plain CSS files.
- **154 files import Mantine** across ~50 APIs. The ones that matter:

  | API | Uses | Replacement |
  | --- | ---: | --- |
  | `Button` | 71 | `Button` |
  | `Tooltip` | 46 | `Tooltip` (the existing wrapper is rebuilt) |
  | `Loader` | 42 | `Spinner` |
  | `ActionIcon` | 40 | `IconButton` |
  | `showNotification` / `updateNotification` / `hideNotification` | 55 | `toast` store, same three verbs |
  | `useModals` / `ContextModalProps` / `ModalsProvider` | 60 | our own modal manager, same API shape |
  | `TextInput`, `Textarea`, `NumberInput`, `PasswordInput`, `JsonInput`, `ColorInput` | 49 | form controls + `Field` wrapper |
  | `Select`, `MultiSelect` | 26 | `Select`, `MultiSelect` (combobox) |
  | `Menu`, `Popover` | 20 | `Menu`, `Popover` |
  | `Checkbox`, `Switch`, `SegmentedControl` | 25 | same names |
  | `Badge`, `Breadcrumbs`, `Table`, `Tabs`, `Accordion`, `Avatar`, `Image`, `Divider`, `LoadingOverlay`, `Pagination` | ~50 | same or similar names |
  | `Group`, `Stack`, `Box`, `Text` | ~25 | Tailwind flex/gap utilities, no component |
  | `MantineProvider` | 17 | removed (most are in tests and embedded pages) |
  | `useMantineTheme` / `useModalTheme` | 5 | tokens |
  | `@mantine/hooks` (`useDebouncedValue`, `useLocalStorage`, `useHotkeys`) | 3 | small local hooks (`useLocalStorage` already exists) |
  | `@mantine/spotlight` | 2 | folded into `GlobalSearch` |

- A theme contract already exists: `ui/styles/theme.css` (`--cms-*` properties)
  and `docs/themes.md`. Themes load **unlayered, after** the base CSS. We keep
  the `--cms-*` names already published (e.g. `--cms-drawer-*`, `--cms-accent`)
  and grow the set.
- Older unprefixed variables in `global.css` (`--color-border`,
  `--surface-background`, …) are used across component CSS.
- BEM-ish naming is already used in places (`.DocEditor__statusBar`); others
  use `.text.size\:body-sm`. We standardize on one.
- Responsive handling is close to nothing: about 10 `@media` queries.
- Tests: vitest. Visual tests (`*.visual.test.tsx`, Playwright) exist with
  local-only goldens. `docs/screenshots/` renders product scenes from TSX.

## Baseline health (measured on `main` @ `084c2d55`)

These failures already exist. Agents must not make them worse, and fixing
them isn't in scope unless they block a phase.

- `tsc -p ui/tsconfig.json --noEmit`: **355 errors**. Nothing in CI
  typechecks the UI; esbuild strips types. Typecheck gate: **no new errors**
  (compare sorted messages).
- UI unit tests (`vitest run ui`, jsdom, no emulator needed): **540/540 pass**.
- Visual tests that already fail: `TranslationsTable` (3/3, vi.mock factory
  error), `FieldHistory` (1/1), `PortTranslationsModal` (1/2),
  `ImagePastePlugin` (1/1), `PublishDocModal` (crashes the runner). When a
  crash aborts the run, run visual files one at a time.
- Local Java is 17, but the Firestore emulator (firebase-tools ≥ 15) needs
  21, so core integration tests can't run here.

## Key decisions (proposed defaults)

### D1. Tailwind v4, no preflight until Mantine is gone

- Tailwind v4 via its CLI (or an esbuild plugin; decide in the Phase 0 spike).
  Output goes into `ui.css` or a second stylesheet served next to it.
- While Mantine is still around, import only the `theme` and `utilities`
  layers. **No preflight**, so Mantine and not-yet-migrated pages keep working.
  Preflight comes in Phase 5.
- Layer order: `@layer theme, base, components, utilities;`. Theme files and
  custom CSS from Settings stay **unlayered**, which means they beat any
  Tailwind utility without needing specificity tricks. That is what makes
  utilities-in-markup and themeability work together.
- No class prefix (`tw:`). There's little collision risk since the CMS owns its
  page, and unprefixed classes are easier to read. Revisit if the spike turns
  up clashes.

### D2. Tokens: `--cms-*` is the source, Tailwind maps onto it

`ui/styles/theme.css` stays the single documented contract, grouped and
commented like it is now:

```css
:root {
  /* --- Color ---------------------------------------------------------- */
  /* Page background behind surfaces. */
  --cms-color-page: #fbfbf9;
  /* Cards, panels, modals. */
  --cms-color-surface: #fff;
  --cms-color-text: #333;
  --cms-color-text-muted: #6b7280;
  --cms-color-border: #e4e4e1;
  --cms-accent: #d9a6c8;            /* existing name, kept */
  --cms-color-danger: …; --cms-color-success: …; --cms-color-warning: …;
  /* --- Shape, type, elevation, layering ------------------------------- */
  --cms-radius-sm/md/lg, --cms-font-sans, --cms-font-mono, --cms-font-size,
  --cms-shadow-popover, --cms-shadow-modal, --cms-z-popover, --cms-z-modal …
  /* --- Components (only where a theme plausibly wants a dial) --------- */
  --cms-button-radius, --cms-input-height, --cms-sidebar-width, …
}
```

`ui/styles/tailwind.css` maps tokens with `@theme inline { --color-surface:
var(--cms-color-surface); … }`, so markup says `bg-surface text-muted
border-border rounded-md`. A theme changes one variable and both the utilities
and the BEM CSS follow. The old unprefixed vars become aliases of the new
tokens and are deleted in Phase 5.

Caveat: media queries can't read custom properties, so breakpoints are Tailwind
config only (`sm` 640, `md` 768, `lg` 1024) and aren't themeable.

### D2a. Design normalization ("refresh where inconsistent")

Phase 0 includes a **design audit**: a script that inventories every literal
value in `ui/**/*.css` and inline styles (colors, font sizes, weights,
spacings, radii, shadows, z-indexes) and counts how often each is used. From
that inventory we pick one scale per dimension, and you review it at
Checkpoint 0:

- Spacing: Tailwind's 4px scale; stray values like 6px, 10px, and 30px snap to
  the nearest step.
- Type: about 5 sizes (11/12/14/16/20) and 3 weights. Today the editor sits at
  12px while pages use 14px; we make that a deliberate choice.
- Color: a neutral ramp + accent + danger/warning/success. The many
  near-duplicate grays (`#333`, `#6b7280`, `#dee2e6`, `#efefef`, `#e4e4e1`, …)
  collapse onto it.
- Radius, shadow, and z-index: 3–4 named steps each.

The rule for agents: use tokens or Tailwind's scale only, with no arbitrary
values (`p-[13px]`). Where the port would change something visibly, the agent
calls it out in its PR summary.

### D3. Class naming: BEM hooks plus utilities

- Every component root gets its PascalCase block class, and every meaningful
  part gets an element class: `Button`, `Button__icon`, `Dialog__header`,
  `DocEditor__statusBar`. Utilities provide the styling; the BEM classes are
  stable, documented hooks for themes and tests.
- Variants and states use **BEM modifiers**: `Button--variant-primary`,
  `Button--size-sm`, `Menu__item--active`. Accessibility state stays in ARIA
  (`aria-expanded`, `aria-selected`) and isn't duplicated.
- Component CSS files stay colocated, but only for what utilities can't express
  cleanly (keyframes, complex selectors, third-party DOM inside Lexical or
  ag-grid). Don't `@apply` whole components.
- `joinClassNames` stays. Decision for you: add `tailwind-merge` (~7kb) so a
  caller's `className` can override a primitive's utilities predictably.
  **Recommended: yes**, wrapped as `cn()` in `ui/utils/classes.ts`.
- Phase 5 adds a generated **theming reference**
  (`docs/themes.md#hooks`): a script that scans components for BEM blocks and
  elements and lists them next to the `--cms-*` tokens.

### D4. Primitives: home-grown, minimal dependencies

- Location: `ui/components/ui/<Name>/<Name>.tsx`, a primitives tier separate
  from feature components.
- Positioning for Tooltip/Popover/Menu/Select: `@floating-ui/dom`, a small,
  framework-agnostic library. Native `<dialog>` for modals, which gives us a
  free focus trap, Esc handling, and top-layer stacking.
- The modal manager keeps the **`useModals().openContextModal(...)`,
  `openConfirmModal`, `closeModal` and `ContextModalProps` shape**, so the 60
  call sites migrate by changing an import. That's the largest mechanical win.
- Toasts keep the `show/update/hide` shape for the same reason.
  `ui/utils/notifications.ts` stays the public entry point.

### D5. Mobile patterns (applied everywhere)

| Desktop | ≤ `md` (768px) |
| --- | --- |
| Collapsible sidebar | Off-canvas drawer behind a header hamburger |
| Centered modal | Full-screen sheet (`Dialog` handles it, callers do nothing) |
| Editor ⟷ preview split panel | Tabs: Edit / Preview / (Comments) |
| Wide tables | Card list, or horizontal scroll with a sticky first column |
| Hover-only actions (icon rows, tooltips) | Always visible, or an overflow `Menu`. Tooltips never hold the only label |
| Popovers / menus | Bottom sheet on touch (optional, per component) |

Touch targets are at least 40px on coarse pointers
(`@media (pointer: coarse)`). Inputs keep their desktop text size on mobile;
`maximum-scale=1` on the viewport stops iOS zooming on focus.

### D6. Branching

All work lands on `cms-ui-rewrite`. Each subagent works in its own worktree
branched from it. I review the work, then merge it back into `cms-ui-rewrite`
as one squashed commit per workstream, so you review per commit. The final PR
goes from `cms-ui-rewrite` to `main`. Coexistence without preflight still
matters, because it keeps the branch working at every commit.

### D7. Folder reorganization (proposed, review before Phase 0 starts)

Today `ui/components/` holds 93 flat folders that mix primitives, feature
widgets, and modals. `ui/utils/` holds 99 flat files that mix Firestore data
access, Google integrations, and pure helpers. The proposal is to organize by
**feature**, so each Phase 3 agent owns exactly one folder:

```
packages/root-cms/ui/
  main.tsx                 # was ui.tsx: bootstrap only (firebase init, render)
  app/                     # App, providers, route table, Layout, error boundary
    App.tsx  routes.ts  providers.tsx  layout/  AppErrorBoundary/
  primitives/              # Phase 1: Button, Dialog, Menu, Select, …
    Button/Button.tsx  …  index.ts
  components/              # shared cross-feature composites only
    UserAvatar/ UserTag/ Markdown/ ErrorDetails/ DocStatusBadges/ …
  features/
    ai/                    # RootAIChat, AiEditModal, AiSummary, AIPage, ai-chats.ts
    assets/                # AssetBrowser, pickers, uploader, asset-sync/, assets.ts
    collections/           # ProjectPage, CollectionPage, CollectionTree, doc pickers
    comments/              # Comment*, PinnedCommentThreads, comments.ts
    data-sources/          # DataSource* pages/components, data-source.ts, gsheets.ts
    documents/             # DocumentPage, DocEditor/, fields/, RichTextEditor/,
                           # DocDiff, VersionHistory, useDraftDoc, doc.ts
    logs/                  # ActionLogs, LogsPage, ErrorLogsPage
    releases/              # Releases*, Publish*, Checks*, release.ts
    search/                # GlobalSearch, SearchBar, SearchPanel, doc-search.ts
    settings/              # SettingsPage, PermissionGroupsBox, ShareBox, users
    tasks/                 # Task*, tasks.ts
    translations/          # Translations*, Localization*, l10n.ts, arb.ts
  hooks/                   # generic hooks only (useLocalStorage, useQueryParam, …)
  utils/                   # generic pure helpers only (classes, debounce, time, …)
  integrations/            # google-auth, gapi, gcs, gdrive (cross-feature)
  styles/                  # theme.css (contract), tailwind.css, base.css
  dev/                     # gallery route (/cms/_ui), test-theme.css
  types/                   # *.d.ts shims (mantine-spotlight, react-json-view-compare)
```

Within a feature the layout is flat when the feature is small, and
`pages/` + `components/` when it's large. Data and model modules
(`release.ts`, `tasks.ts`, …) sit at the feature root, next to the UI that uses
them. Tests stay colocated.

Other tidy-ups in `packages/root-cms`:

- `signin/` uses the same `styles/` tokens and Tailwind pipeline, so it gets
  consistent styling for free. It stays a separate entry point.
- `VISUAL_TESTING.md` moves to `docs/visual-testing.md`, rewritten for the new
  tooling.
- The stray (untracked) `firestore-debug.log` should be cleaned up. It's
  already gitignored by `*.log`.

**Out of scope for this branch, but worth a follow-up:** `core/` is 99 flat
files. Grouping `ai-*`, `search-*`, `services-notifications-*`, and `release-*`
into subfolders would be a similar tidy-up. It changes no public exports, since
`dist/` entry names come from the esbuild config.

**How the move happens:** one mechanical commit with **no code changes**. A
script (`scripts/ui-reorg.ts`) holds an explicit old → new path map, runs
`git mv` (history follows), and rewrites relative imports across `ui/`, the
tests, and `docs/screenshots`. We verify the commit with lint, typecheck,
build, and tests passing. Keeping moves out of the rewrite diffs keeps every
later commit reviewable.

### D8. Dependencies

Add:

- `tailwindcss` + `@tailwindcss/cli` (dev).
- `tailwind-merge`, behind `cn()`.
- `@floating-ui/dom`, for positioning.
- `axe-core` (dev), for a11y checks in primitive tests.

Remove: all of `@mantine/*` (and the emotion runtime that comes with it).

Deliberately not added: Radix/Headless UI/Ark (too heavy for Preact compat,
and native `<dialog>` + floating-ui cover our needs), `clsx` (redundant with
`cn`), icon libraries beyond `@tabler/icons-preact`, and animation libraries
(CSS transitions are enough).

## QA and verification tooling (built in Phase 0)

1. **UI gallery**: a dev-only route `/cms/_ui` (behind a flag or `NODE_ENV`).
   It renders every primitive in every variant and state, with toggles for
   viewport width (375 / 768 / 1280 iframe), theme (none / a deliberately loud
   `test-theme.css` that changes every token), and pointer (fine / coarse). It
   runs on the real CSS pipeline inside `docs/`, so it shows what ships. Each
   primitive PR adds its gallery entry.
2. **Primitive visual and a11y tests**: a `renderVisual()` helper that
   screenshots at 375 and 1280 and runs `axe-core`. Use it for primitives only
   (they're core). Pages get no visual tests, per AGENTS.md.
3. **Page before/after screenshots**: a Playwright script
   (`scripts/ui-snapshots.ts`) that walks a route list on the `docs/` dev server
   at 375 / 768 / 1280 and writes PNGs to a gitignored folder. Run it on `main`
   before a workstream and on the branch after, and get an HTML side-by-side
   diff report. The spike needs to solve auth (Firebase emulator user or
   test-only sign-in bypass) and seed data.
4. **Mantine ratchet**: ESLint `no-restricted-imports` for `@mantine/*` with an
   allowlist file of not-yet-migrated paths. A migrated file can't regress.
   `pnpm ui:progress` prints remaining files and imports per area.
5. **Per-PR checks**: `pnpm lint`, typecheck, `pnpm build`, existing unit tests
   for touched areas, the snapshot diff, plus a manual pass in the gallery or
   docs at phone width (Chrome devtools or a real device on the LAN).

## Phases and task list

Each phase ends with a **review checkpoint**. Nothing in the next phase starts
until you've signed off.

### Phase 0: Foundation (serial, one agent / me)

- [x] 0.0 Folder reorg (D7): a pure-move commit, verified green (`ce52e51e`).
      Differences from the proposal:
      - `hooks/` also keeps the app-wide context hooks (`useFirebase`, `useSSE`,
        `useSiteSettings`, `useUserPreferences`, `useTheme`).
      - Two features were added: `features/users/` (avatars, tags, user
        select, roles/permissions, profiles) and `features/sidebar-tools/`.
      - `ui.tsx` was only renamed to `main.tsx`. Splitting it into
        `app/App.tsx` + `routes.ts` + `providers.tsx` is code, so it moves to
        2.1.
- [x] 0.0b Design audit. Inventory: 236 distinct colors, 36 font sizes, 61
      spacings, 23 radii, 19 shadows. The scales and the legacy → token
      snapping table are in `ui/README.md`.
- [x] 0.1 Tailwind v4 CLI → gitignored `ui/styles/tailwind.out.css`,
      imported first by `main.tsx`. Watch mode is wired into `pnpm dev`, and
      a newly used class reaches the served CSS in about 3s. No current class
      name collides with a utility, so nothing changes visually.
- [x] 0.2 `theme.css` holds the full token contract, `tailwind.css` maps
      tokens with `@theme inline` and clears Tailwind's defaults, legacy vars
      are aliased, and `global.css` moved into `@layer base`. axe flagged the
      contrast of the muted, success, and warning tokens, so they're darkened
      slightly.
- [x] 0.3 `cn()` (tailwind-merge, verified against our token names), the
      conventions doc at `ui/README.md`, and an AGENTS.md update.
- [x] 0.4 Gallery at `/cms/_ui/:entry`, gated on the dev server
      (`__ROOT_CTX.build` is null), with viewport toggles (375 / 768 / 1280,
      one iframe each) and the test-theme toggle. The pointer toggle was
      dropped because an iframe can't emulate `pointer: coarse`; use devtools
      device mode for that.
- [x] 0.5 `testGallery(entry)`: reuses gallery stories as screenshot + axe
      tests at 375 and 1280.
- [x] 0.6 `pnpm ui:snapshots` (`--login` once, `--label`, `--compare a,b`).
      It runs against the docs dev server with your real sign-in; the session
      is saved, IndexedDB included, to `.ui-snapshots/auth.json`.
- [x] 0.7 ESLint ratchet + `ui/mantine-allowlist.json` (154 files) +
      `pnpm ui:progress [--fix]`.
- [x] 0.8 Subagent brief template (appendix below).

**Checkpoint 0:** you review the token names and values (open `/cms/_ui/tokens`
on the dev server, and toggle the test theme), the conventions doc, and the
tooling. To review:

1. **13px text** (86 uses in 41 components) sits between `text-sm` (12) and
   `text-base` (14). Options: snap it to 12 (denser), snap it to 14 (roomier),
   or decide per context (12 in tables, lists, and editor chrome; 14 in body
   copy and form controls).
2. Token names: `fg` / `strong` / `muted` / `subtle` for text, and `border`
   / `border-strong` for lines.
3. Run `pnpm ui:snapshots --login` once, then `--label baseline`, so Phase 2+
   has a pre-rewrite baseline.

### Phase 1: Primitives (parallel, 5 agents in worktrees)

Every primitive ships with: a BEM root and parts, token-driven utilities,
keyboard and ARIA behavior, mobile behavior, a gallery entry, and a visual+axe
test. Primitives are **not** wired into feature code yet.

- [x] 1A **Actions & display**: `Button`, `IconButton`, `Spinner`, `Badge`,
      `Avatar`, `Divider`, `LoadingOverlay`, `Skeleton`, `Kbd`. (`Image` dropped:
      use `<img>`.)
- [x] 1B **Form controls**: `Field` (label/description/error; replaces
      `InputWrapper`), `TextInput`, `Textarea` (autosize), `NumberInput`,
      `PasswordInput`, `JsonInput`, `ColorInput`, `Checkbox`, `Switch`,
      `SegmentedControl`.
- [x] 1C **Floating layer**: `useFloating` wrapper, `Tooltip`, `Popover`,
      `Menu` (roving focus, typeahead, submenus if used). Rebuild
      `ConditionalTooltip`.
- [x] 1D **Dialogs & toasts**: `Dialog` (mobile sheet), the modal manager
      (`ModalsProvider`, `useModals`, `ContextModalProps`, `openConfirmModal`),
      and the toast store + `Toaster`.
- [x] 1E **Navigation & data**: `Tabs`, `Accordion`, `Breadcrumbs`,
      `Pagination`, `Table` (responsive variant).
- [x] 1F **Combobox** (starts when 1C lands): `Select` (searchable),
      `MultiSelect` (creatable if used). Audit the current props in use first.

Overlays (tooltips, menus, toasts, dropdowns) portal through
`primitives/floating/Portal`, which targets the topmost open `<dialog>`
(`useOverlayRoot()`), because a modal dialog makes the rest of the page inert.

**Checkpoint 1:** you review the gallery at all three widths and the API docs
for each primitive. Done; answers are rows 7–13 of the decisions log.

### Phase 2: App shell (serial, one agent)

- [x] 2.1 Swap providers in `ui.tsx` and the embedded pages (modals, toasts),
      and delete `useModalTheme`. Embedded pages are routes under the same
      providers, so `main.tsx` was the only place. Instead of setting
      `withinPortal={false}` per component, `main.tsx`'s
      `MantineCompatProvider` points Mantine's `Portal` default `target` at
      the topmost open `<dialog>` (via `useOverlayRoot()`), which fixes every
      Mantine select, menu, popover, tooltip and nested Mantine `Modal`
      inside a dialog at once (the doc editor in `ReferenceFieldEditorModal`
      has dozens). Escape inside a nested Mantine modal or open Mantine
      dropdown no longer also closes the dialog. Splitting `main.tsx` into
      `app/App.tsx` + `providers.tsx` is still to do.
- [x] 2.2 `Layout`: responsive header + drawer sidebar, safe-area insets,
      `SplitPanel` mobile fallback. The drawer is `Dialog` with the new
      `position="left"`. `SplitPanel` takes `mobileTabs` (the doc page passes
      Edit / Preview); without it the panels stack below `md`. The doc
      editor's fixed status bar leaves the header's menu button uncovered
      and scrolls sideways below `md`. The viewport meta gained
      `viewport-fit=cover` so `env(safe-area-inset-*)` works.
- [x] 2.3 Shared bits: `Heading`, `Text`, `Surface`, `RouteLoading`,
      `RouteLoadError`, `DataLoadError`, `ErrorDetails`, `AppErrorBoundary`,
      `UserAvatar`, `UserTag`, `Viewers`. `Heading`/`Text` keep their props
      but render `Heading--size-*`/`Text--size-*` BEM classes + utilities
      (headings snap 18px → 20px). `RouteLoadError` and `DataLoadError`
      share `ErrorScreen`. `components/Tooltip` is a thin wrapper over the
      primitive that accepts Mantine's `position`; `ConditionalTooltip`
      uses the primitive.
- [x] 2.4 `GlobalSearch` absorbs `@mantine/spotlight`, and becomes full-screen
      on mobile. It's a `Dialog` with an input (`role="combobox"`) driving a
      listbox via `aria-activedescendant`; the combobox helpers in
      `primitives/Select` are built around a floating dropdown, so they
      weren't reused. The spotlight type shim is deleted.

**Checkpoint 2:** the CMS shell works on a phone, and every page is still
reachable.

### Phase 3: Feature areas (parallel, 5 agents in worktrees, disjoint files)

Each agent migrates its file set off Mantine, applies the D5 mobile patterns,
converts its CSS to utilities + BEM + tokens, and attaches before/after
snapshots to its PR.

- [ ] 3A **Releases & publishing**: `ReleasesPage`, `ReleasePage`,
      `New`/`EditReleasePage`, `ReleaseForm`, `ReleaseStatusBadge`,
      `ScheduleReleaseModal`, `AddToReleaseModal`, `PublishDocModal`,
      `PublishChecksModal`, `PublishChecksResults`, `ChecksPanel`,
      `CheckStatusBadge`, `LockPublishingModal`.
- [ ] 3B **Translations**: all `Translations*` pages, `DocTranslationsPage`,
      `TranslationsTable`, `EditTranslationsModal`, `PortTranslationsModal`,
      `PruneTranslationsModal`, `LocalizationModal`, `LocalizedValues`,
      `ExportSheetModal`.
- [ ] 3C **Collections & doc listing**: `ProjectPage`, `CollectionPage`,
      `CollectionTree`, `DocPreviewCard`, `DocStatusBadges`, `DocPickerModal`,
      `DocSelectModal`, `NewDocModal`, `CopyDocModal`, `SlugInput`,
      `SearchPanel`, `DocActionsMenu`, `VersionHistoryModal`,
      `CompareDraftModal`, `DocDiffViewer`, `ComparePage`.
- [ ] 3D **Data, assets, settings, logs**: `DataPage`, `DataSourcePage`,
      `New`/`EditDataSourcePage`, `DataSourceForm`, `DataSource*`, `AssetsPage`,
      `AssetBrowser`, `AssetPickerModal`, `AssetUploader`, `FilePreview`,
      `SettingsPage`, `PermissionGroupsBox`, `ShareBox`, `UserSelect`,
      `ErrorLogsPage`, `LogsPage`, `ActionLogs`.
- [ ] 3E **Tasks, comments, AI**: `TasksPage`, `TaskPage`, `TaskManager`,
      `TaskTargetLaunch`, `TaskCommentInput`, `Comment*`,
      `PinnedCommentThreads`, `RootAIChat`, `AIPage`, `AiEditModal`,
      `AiSummary`, `ChatErrorNotice`, `FieldHistory`.

**Checkpoint 3:** after each PR (they land independently).

### Phase 4: Document editor (the hard one, 2 agents, sequenced)

`DocEditor.tsx` alone is 3.2k lines, and the area is 7.6k.

- [ ] 4.1 `DocumentPage` + `EmbeddedDocumentPage` + `DocumentPagePreviewBar`:
      the edit/preview tab layout on mobile, plus the status bar and actions.
- [ ] 4.2 `DocEditor` field chrome (groups/drawers, arrays, labels, help, the
      existing `--cms-drawer-*` contract) and the simple fields.
- [ ] 4.3 Complex fields: `FileField`, `ImageEditorDialog`,
      `AiImageEditorDialog`, `GenerateImageForm`, `Reference(s)Field`,
      `MultiSelectField`, `DateTimeField`.
- [ ] 4.4 `RichTextEditor` toolbar and floating link editor (Lexical stays; we
      reskin only).

4.2 and 4.3 can run in parallel once 4.1 is in.

**Checkpoint 4:** a full editing session on a phone (create doc → edit all field
types → preview → publish).

### Phase 5: Removal & polish (serial)

- [ ] 5.1 Remove `@mantine/*` deps, `mantine.css`,
      `mantine-spotlight-internal.d.ts`, and the ratchet allowlist.
- [ ] 5.2 Enable Tailwind preflight, reconcile `global.css`, delete the legacy
      vars.
- [ ] 5.3 Finalize `theme.css` + `docs/themes.md`, and generate the BEM hooks
      reference.
- [ ] 5.4 Update the `docs/screenshots` scenes if they mirror Mantine markup,
      then re-render. Port the docs site's own themes
      (`docs/cms/themes/clarity.css`, `compact.css`) to the new tokens and hooks,
      since they double as the real-world test of the theme contract.
- [ ] 5.5 Report bundle size before/after, and do a full snapshot sweep at all
      widths. Changeset (patch, per repo rules, or flag this as the headline of
      a minor).

## How subagents are used

- **Who:** general-purpose agents, each with `isolation: "worktree"`, so
  parallel agents never touch the same checkout. Phase 3 file sets are
  disjoint by construction. Shared files (`ui.tsx`, `theme.css`, the ratchet
  allowlist) are edited by me when integrating, not by the agents.
- **Wave size:** 5 at a time (Phase 1, Phase 3). Everything else is serial.
- **Brief template** (Phase 0.8) includes this plan's path, the conventions
  doc, the exact file list, the primitives' APIs, the definition of done (no
  `@mantine` in owned files, lint/typecheck/build pass, gallery/tests or
  before/after snapshots, a mobile check at 375px, no edits outside owned
  files), and instructions to return a summary + screenshots paths + open
  questions.
- **Ownership:** after the reorg, each Phase 3 agent owns one
  `ui/features/<name>/` folder. Anything outside that folder is off-limits; an
  agent that needs a primitive change reports it back to me.
- **My role per wave:** launch, review each worktree's diff against the
  conventions (I don't rubber-stamp agent output), run the verification,
  squash-merge into `cms-ui-rewrite`, and hand you the commits at the
  checkpoint.
- If you want heavier fan-out (e.g. a separate adversarial reviewer agent per
  PR), I can do that with a workflow. Say "use a workflow", but it costs
  noticeably more tokens.

## Open questions for you

1. Folder reorg (D7): approve the layout as-is, or adjust it? In particular:
   are you OK with renaming `ui.tsx` to `main.tsx` + `app/`, `primitives/` as a
   sibling of `components/`, and data modules living inside their feature?
2. Should the `core/` tidy-up happen on this branch, or as a follow-up
   (recommended)?

## Appendix: subagent brief template

Each agent gets this brief with the `{…}` filled in, and runs in its own
worktree branched from `cms-ui-rewrite`.

```
You're migrating part of the Root CMS UI off Mantine onto Tailwind, as one
workstream of a staged rewrite. Work only in this worktree.

Read first:
- packages/root-cms/docs/ui-rewrite-plan.md (context, decisions, baseline)
- packages/root-cms/ui/README.md (tokens, class naming, mobile, a11y,
  legacy value snapping; follow it exactly)
- AGENTS.md (repo conventions: comments end in punctuation, .js import
  extensions, conventional commits)

Your workstream: {phase/id and name}
Files you own (don't edit anything else): {paths or globs}
Primitives available: {list, with their import paths}

Do:
- {specific goals, e.g. "replace every @mantine import in your files with
  primitives", "apply the mobile patterns", "convert CSS to utilities + BEM"}
- Remove the migrated files from ui/mantine-allowlist.json
  (`pnpm ui:progress --fix` in packages/root-cms).
- If you need a primitive change or a new token, don't make it. Note it as
  an open question.

Definition of done:
- `pnpm lint` passes from the repo root.
- `npx tsc -p packages/root-cms/ui/tsconfig.json --noEmit` shows no new
  errors compared with the baseline in the plan (compare sorted messages).
- `npx vitest run ui` passes in packages/root-cms.
- `pnpm build` passes in packages/root-cms.
- {primitives: gallery entry + `testGallery()` visual test passing, goldens
  reviewed by eye at 375 and 1280}
- {pages: you checked the layout at 375px; snapshots are taken by the lead}
- One commit: `chore: {summary}` with the attribution trailer.

Report back (keep it short):
- What changed, per file group.
- Any visible design changes caused by snapping to the scales.
- Screenshot paths you looked at.
- Open questions and anything you skipped.
```
