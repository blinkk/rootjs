# CMS UI conventions

How the CMS UI (`packages/root-cms/ui/`) is built and styled. The folder
layout is described in the repo's `AGENTS.md`. The Mantine → Tailwind rewrite
plan, and where it stands, is in `../docs/ui-rewrite-plan.md`.

## Styling

### Tokens

Every color, font, type size, radius and shadow comes from a `--cms-*` custom
property in `styles/theme.css`. That file is the theme contract: projects
restyle the CMS by overriding those properties (see `../docs/themes.md`).

`styles/tailwind.css` maps the tokens onto Tailwind, and clears Tailwind's own
defaults, so only on-scale utilities exist:

| Kind | Utilities |
| --- | --- |
| Surfaces | `bg-page` `bg-surface` `bg-surface-hover` `bg-surface-active` `bg-chip` `bg-overlay` |
| Lines | `border-border` `border-border-strong` (also `divide-*`, `outline-*`, `ring-*`) |
| Text | `text-fg` `text-strong` `text-muted` `text-subtle` (placeholders and disabled only; it fails contrast by design) `text-inverse` `text-link` |
| Actions | `bg-primary` `bg-primary-hover` `text-on-primary` `bg-accent` `ring-focus` |
| Status | `{text,bg,border}-{info,success,warning,danger}`, with `-soft` (background) and `-line` (border) variants |
| Type | `font-sans` `font-mono`; `text-2xs` 10 (badges only) · `text-xs` 11 · `text-sm` 12 · `text-base` 14 · `text-lg` 16 · `text-xl` 20 · `text-2xl` 24 |
| Shape | `rounded-sm` 4 · `rounded-md` 6 · `rounded-lg` 8 · `rounded-xl` 12 · `rounded-full` |
| Elevation | `shadow-sm` (cards) · `shadow-md` (menus, popovers) · `shadow-lg` (modals, toasts) |
| Stacking | `z-(--cms-z-sticky)` `z-(--cms-z-dropdown)` `z-(--cms-z-modal)` `z-(--cms-z-toast)` `z-(--cms-z-tooltip)` |
| Controls | `h-control-xs` 24 · `h-control-sm` 28 · `h-control-md` 36 (also `w-`, `size-`, `min-h-`) for buttons and single-line inputs |
| Spacing | Tailwind's 4px scale (`p-2` = 8px). Half steps up to 3.5 (`gap-1.5` = 6px) are fine for dense controls |

Rules:

- **No arbitrary values** (`p-[13px]`, `text-[#333]`, `bg-[var(--x)]`). If a
  value isn't on a scale, snap it (see "Migrating legacy values" below), or
  add a token to `theme.css` + `tailwind.css` if a theme should be able to
  change it.
- Only the token-backed utilities above carry design decisions. Layout
  utilities (`flex`, `grid`, `gap-*`, `w-*`, `truncate`, `sr-only`, …) are
  used freely.
- Need a new themeable dial? Add it to `theme.css` with a comment and its
  stock value, map it in `tailwind.css` if it's a color, size or shadow, and
  use it. That's how the contract grows.

### Cascade layers

Lowest to highest priority: `theme` → `base` (`global.css`) → `components` →
`utilities` → **unlayered** (legacy component CSS, Mantine, project themes,
custom CSS).

**No CSS reset yet:** Tailwind's preflight is off until Mantine is removed,
so native defaults still apply. Reset them where you use them: `m-0 list-none
p-0` on lists, `m-0 border-0 p-0` on fieldsets, `appearance-none` and an
explicit border/background on buttons and inputs. `global.css` also sets
`img, svg, iframe {height: auto}`, which overrides `height` attributes, so
size those elements with classes or inline styles.

**Gotcha while migrating:** unlayered legacy CSS beats every utility,
whatever its specificity. When you convert an element to utilities, delete
the legacy rules that target it. Don't style one element half with utilities
and half with legacy CSS.

### Class names: utilities for styling, BEM for hooks

Every component root has a **block** class named after the component, and
every meaningful part has an **element** class. These are stable hooks for
themes, tests and debugging. Utilities do the styling.

```tsx
<button
  className={cn(
    'Button',
    `Button--variant-${variant}`,
    `Button--size-${size}`,
    'inline-flex items-center gap-1.5 rounded-sm px-3 text-sm font-medium',
    variant === 'primary' && 'bg-primary text-on-primary hover:bg-primary-hover',
    props.className
  )}
>
  {icon && <span className="Button__icon shrink-0">{icon}</span>}
  <span className="Button__label truncate">{children}</span>
</button>
```

- Block: `PascalCase`, matching the component (`DocEditor`).
- Element: `Block__camelCase` (`DocEditor__statusBar`).
- Modifier: `Block--name-value` for enums (`Button--variant-primary`,
  `Button--size-sm`) and `Block--name` for booleans (`Menu__item--danger`).
- Interactive state goes in ARIA (`aria-expanded`, `aria-selected`,
  `aria-disabled`, `aria-invalid`, `aria-current`) and is styled with
  Tailwind's `aria-*:` variants. It isn't duplicated as a modifier.
- No other naming styles in new code (`size:body-sm`, `active`, `is-open`).
- Use `cn()` from `utils/classes.ts` whenever a `className` prop is merged, so
  the caller's utilities win. `joinClassNames()` is fine everywhere else.
- A colocated `<Name>.css` is only for what utilities can't express cleanly:
  keyframes, complex selectors, `::-webkit-*`, and third-party DOM (Lexical,
  ag-grid). Put its rules inside `@layer components { … }`, select by BEM
  class, and read tokens. Never `@apply` a whole component.

## Primitives

`ui/primitives/<Name>/<Name>.tsx` holds the building blocks that replace
Mantine: `Button`, `IconButton`, `Dialog`, `Menu`, `Select`, `Tooltip`, … They
are the only place low-level interaction logic (focus trapping, positioning,
keyboard navigation) lives. Feature code composes primitives and doesn't
re-implement them.

- Import directly: `import {Button} from '../../primitives/Button/Button.js'`.
- Every primitive spreads the remaining native props onto its root element,
  accepts `className` (merged with `cn()`), and forwards `ref` (via
  `forwardRef` from `preact/compat`) when it wraps a single DOM element.
- Positioning (tooltips, popovers, menus, selects) uses `@floating-ui/dom`
  through the shared `useFloating` hook. Modals use native `<dialog>`.
- Overlays render through `primitives/floating/Portal`, which targets the
  topmost open `<dialog>` (a modal dialog makes the rest of the page inert).
  Never portal straight to `document.body`.
- Callbacks: native inputs keep `onChange`/`onInput`. Controls whose value
  isn't a plain string, or that change it themselves, take
  `onValueChange(value)`.
- Sizes are `xs` 24px, `sm` 28px (default) and `md` 36px. Mantine's `xs`
  maps to `sm`, and its `sm` to `md`.
- Notifications go through `utils/notifications.ts` and modals through
  `useModals()`. Keep using those entry points; their internals are swapped.
- Icons come from `@tabler/icons-preact`, at size 16 by default (14 in dense
  controls).
- Each primitive needs a gallery entry (`/cms/_ui`) and a visual + axe test.

Layout helpers like Mantine's `Group`, `Stack` and `Box` have no
replacement. Use flex/grid utilities.

## Mobile

Every screen must work at **375px wide**. Breakpoints: `sm` 640, `md` 768,
`lg` 1024. Build mobile-first: unprefixed utilities are the phone layout, and
`md:` adds the desktop one.

| Desktop | Below `md` |
| --- | --- |
| Sidebar | Off-canvas drawer behind a header menu button |
| Centered modal | Full-screen sheet (`Dialog` does this, callers do nothing) |
| Side-by-side panels (editor ⟷ preview) | Tabs |
| Wide tables | Card list, or horizontal scroll with a sticky first column |
| Hover-revealed actions | Always visible, or in an overflow `Menu` |
| Tooltip-only labels | Visible label or `aria-label`; tooltips are extras |

- Touch targets are at least 40×40px on coarse pointers: use the
  `pointer-coarse:` variant to enlarge them.
- Inputs keep their desktop text size on mobile. The viewport's
  `maximum-scale=1` (in `core/app.tsx`) stops iOS zooming in on focus.
- Inputs use the `--cms-input-*` tokens (`border-input-border`,
  `text-input-fg`, …), which are cooler than the chrome greys.
- Respect safe areas on fixed elements (`env(safe-area-inset-*)`).
- No horizontal page scroll. Only specific regions (tables, code) may scroll
  sideways.

## Accessibility

- Use real elements: `<button>` for actions, `<a href>` for navigation,
  `<label>` for inputs.
- Every interactive element has an accessible name and a visible focus style
  (`focus-visible:ring-2 ring-focus`).
- Overlays trap focus, close on Escape, and return focus to their trigger.
- Don't rely on color alone. Pair status colors with an icon or text.

## Migrating legacy values

Snap hard-coded values from old CSS onto the scales:

| Legacy value | Token |
| --- | --- |
| `#fff` `#ffffff` | `surface` |
| `#fbfbf9` | `page` |
| `#f8f9fa` `#fafafa` `#f5f5f5` `#f1f1ee` `#f2f3f5` `rgb(248, 249, 250)` | `surface-hover` |
| `#f1f3f5` `#efefef` `#eee` `#e9ecef` `#ececea` | `surface-active` / `chip` |
| `#dee2e6` `#dedede` `#e0e0e0` `#e5e5e5` `#e4e4e1` `#dadce0` | `border` |
| `#ced4da` `#ccc` | `border-strong` |
| `#333` `#343a40` | `fg` |
| `#212529` `#1f1f1f` `#000` (as text) | `strong` |
| `#6b7280` `#868e96` `#666` `#5b616b` `#495057` | `muted` |
| `#9ca3af` `#adb5bd` `#999` `#ababab` | `subtle` |
| `#1971c2` `#0550ae` (links) | `link` |
| `#228be6` `#339af0` `#1c7ed6` | `focus`, or `info` for status |
| `#e7f5ff` | `info-soft` |
| `#c92a2a` `#b42318` `#b00020` | `danger` |
| `#fff5f5` `#ffe3e3` `#ffebe9` | `danger-soft` |
| `#ffa8a8` `#ffcecb` | `danger-line` |
| `#e67700` | `warning` |
| `#fff9db` `#fff3bf` | `warning-soft` |
| `#ffe066` | `warning-line` |
| `#2b8a3e` | `success` |
| `#ebfbee` `#d3f9d8` `#dafbe1` | `success-soft` |
| Mantine `color="dark"` filled | `primary` |
| Mantine `variant="default"` | `bg-surface border-border-strong hover:bg-surface-hover` |
| Font sizes 8–11px | `text-xs` |
| 12px, 12.5px | `text-sm` |
| 13px | By context: `text-sm` in tables, lists, menus and editor chrome; `text-base` in body copy, form controls and dialogs |
| 14px, 15px | `text-base` |
| 16px | `text-lg` |
| 18–22px | `text-xl` |
| 24–28px | `text-2xl` |
| Weights 400 / 500 / 600 / 700, `bold`, 800 | `font-normal` / `font-medium` / `font-semibold` / `font-bold` |
| Line heights 1–1.2 / 1.3–1.45 / 1.5–1.6 | `leading-tight` / `leading-snug` / `leading-normal` |
| Spacing 3px / 5px | 2px or 4px / 4px or 6px (whichever reads better) |
| Spacing 18px / 30px | 16px or 20px / 32px |
| Radius 2–4px / 6px / 8–10px / 12–14px / ≥ 20px, `50%`, `999px` | `sm` / `md` / `lg` / `xl` / `full` |
| One-off `rgba(0,0,0,…)` shadows | `shadow-sm` / `shadow-md` / `shadow-lg` |

Where snapping visibly changes a screen, say so in the change summary.

## Verifying a change

- `pnpm lint` passes (run from the repo root).
- `npx tsc -p packages/root-cms/ui/tsconfig.json --noEmit` reports no new
  errors. The UI has existing errors, so compare against the baseline in the
  plan.
- `npx vitest run ui` in `packages/root-cms` passes (jsdom, no emulator
  needed).
- `pnpm build` in `packages/root-cms` passes.
- Primitives: the gallery entry looks right at 375 / 768 / 1280, with and
  without the test theme, and the visual + axe test passes.
- Pages: before/after snapshots at 375 / 768 / 1280 are reviewed.
- No `@mantine/*` imports remain in files you migrated (the lint ratchet
  enforces this).
