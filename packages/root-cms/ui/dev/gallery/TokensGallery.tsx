import type {ComponentChildren} from 'preact';
import {defineGallery} from './types.js';

const SURFACES = [
  'page',
  'surface',
  'surface-hover',
  'surface-active',
  'chip',
  'overlay',
];
const TEXT = ['fg', 'strong', 'muted', 'subtle', 'link'];
const ACTIONS = ['primary', 'primary-hover', 'accent', 'focus'];
const STATUSES = ['info', 'success', 'warning', 'danger'];
const TYPE_SIZES = ['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl'];
const RADII = ['sm', 'md', 'lg', 'xl', 'full'];
const SHADOWS = ['sm', 'md', 'lg'];

/** Maps token names to utilities. Listed in full so Tailwind sees them. */
const BG: Record<string, string> = {
  page: 'bg-page',
  surface: 'bg-surface',
  'surface-hover': 'bg-surface-hover',
  'surface-active': 'bg-surface-active',
  chip: 'bg-chip',
  overlay: 'bg-overlay',
  primary: 'bg-primary',
  'primary-hover': 'bg-primary-hover',
  accent: 'bg-accent',
  focus: 'bg-focus',
};
const TEXT_COLOR: Record<string, string> = {
  fg: 'text-fg',
  strong: 'text-strong',
  muted: 'text-muted',
  subtle: 'text-subtle',
  link: 'text-link',
};
const STATUS: Record<string, string> = {
  info: 'text-info bg-info-soft border-info-line',
  success: 'text-success bg-success-soft border-success-line',
  warning: 'text-warning bg-warning-soft border-warning-line',
  danger: 'text-danger bg-danger-soft border-danger-line',
};
const TYPE: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-md',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};
const RADIUS: Record<string, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};
const SHADOW: Record<string, string> = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
};

function Swatch(props: {name: string; className: string}) {
  return (
    <div className="TokensGallery__swatch flex flex-col gap-1">
      <div
        className={`h-12 rounded-md border border-border ${props.className}`}
      />
      <code className="font-mono text-xs text-muted">{props.name}</code>
    </div>
  );
}

function Grid(props: {children: ComponentChildren}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
      {props.children}
    </div>
  );
}

/** The design tokens from `theme.css`, as rendered by their utilities. */
export const TokensGallery = defineGallery({
  id: 'tokens',
  name: 'Tokens',
  group: 'Foundations',
  stories: {
    Surfaces: () => (
      <Grid>
        {SURFACES.map((name) => (
          <Swatch key={name} name={name} className={BG[name]} />
        ))}
      </Grid>
    ),
    Actions: () => (
      <Grid>
        {ACTIONS.map((name) => (
          <Swatch key={name} name={name} className={BG[name]} />
        ))}
      </Grid>
    ),
    Text: () => (
      <div className="flex flex-col gap-1 text-base">
        {TEXT.map((name) => (
          <p key={name} className={TEXT_COLOR[name]}>
            <code className="font-mono text-xs">{name}</code> The quick brown
            fox jumps over the lazy dog.
          </p>
        ))}
      </div>
    ),
    Status: () => (
      <div className="flex flex-col gap-2">
        {STATUSES.map((name) => (
          <div
            key={name}
            className={`rounded-md border px-3 py-2 text-sm ${STATUS[name]}`}
          >
            <strong className="font-semibold">{name}</strong> — strong text on
            the soft background, with the line color as its border.
          </div>
        ))}
      </div>
    ),
    'Type scale': () => (
      <div className="flex flex-col gap-2 text-fg">
        {TYPE_SIZES.map((name) => (
          <p key={name} className={`${TYPE[name]} truncate`}>
            <code className="font-mono text-xs text-muted">{name}</code> Publish
            the release to production
          </p>
        ))}
        <p className="font-mono text-sm">font-mono: const doc = await get();</p>
        <p className="text-base">
          <span className="font-normal">normal</span> ·{' '}
          <span className="font-medium">medium</span> ·{' '}
          <span className="font-semibold">semibold</span> ·{' '}
          <span className="font-bold">bold</span>
        </p>
      </div>
    ),
    'Radius and shadow': () => (
      <div className="flex flex-wrap gap-6">
        {RADII.map((name) => (
          <div key={name} className="flex flex-col items-center gap-1">
            <div
              className={`size-16 border border-border-strong bg-surface ${RADIUS[name]}`}
            />
            <code className="font-mono text-xs text-muted">{name}</code>
          </div>
        ))}
        {SHADOWS.map((name) => (
          <div key={name} className="flex flex-col items-center gap-1">
            <div className={`size-16 rounded-lg bg-surface ${SHADOW[name]}`} />
            <code className="font-mono text-xs text-muted">shadow-{name}</code>
          </div>
        ))}
      </div>
    ),
  },
});
