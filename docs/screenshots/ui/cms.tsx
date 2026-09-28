/**
 * Building blocks for recreating the Root CMS UI in screenshot scenes. The
 * markup and class names are simplified, but sizes, colors and iconography
 * follow the real CMS (see `packages/root-cms/ui/layout/Layout.tsx`).
 */

import {
  IconCalendarEvent,
  IconChecklist,
  IconDatabase,
  IconFolder,
  IconHome,
  IconLanguage,
  IconPhoto,
  IconSearch,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import './cms.css';

/** Ids of the built-in sidebar sections, in the order the CMS shows them. */
export type NavId =
  | 'home'
  | 'content'
  | 'tasks'
  | 'releases'
  | 'data'
  | 'assets'
  | 'translations'
  | 'ai';

const NAV_ITEMS: Array<{id: NavId; label: string; icon: ComponentChildren}> = [
  {id: 'home', label: 'Home', icon: <IconHome />},
  {id: 'content', label: 'Content', icon: <IconFolder />},
  {id: 'tasks', label: 'Tasks', icon: <IconChecklist />},
  {id: 'releases', label: 'Releases', icon: <IconCalendarEvent />},
  {id: 'data', label: 'Data', icon: <IconDatabase />},
  {id: 'assets', label: 'Asset Library', icon: <IconPhoto />},
  {id: 'translations', label: 'Translations', icon: <IconLanguage />},
  {id: 'ai', label: 'Root AI', icon: <IconSparkles />},
];

export interface CmsFrameProps {
  /** Highlighted sidebar section. */
  active?: NavId;
  /** Whether to show the expanded (labeled) sidebar. */
  expanded?: boolean;
  /** Avatars shown next to the search bar, e.g. other viewers of a doc. */
  viewers?: string[];
  children?: ComponentChildren;
}

/** The CMS app chrome: top bar, sidebar and a main content slot. */
export function CmsFrame(props: CmsFrameProps) {
  return (
    <div className={`cms-app ${props.expanded ? 'cms-app--expanded' : ''}`}>
      <header className="cms-top">
        <div className="cms-top__logo">Root CMS</div>
        <div className="cms-top__version">v3.5</div>
        <div className="cms-top__project">Lumen Outdoor</div>
        <div className="cms-top__search">
          <IconSearch size={14} />
          Search
          <kbd>⌘K</kbd>
        </div>
        {props.viewers && (
          <div className="cms-top__viewers">
            {props.viewers.map((name) => (
              <Avatar name={name} />
            ))}
          </div>
        )}
      </header>
      <nav className="cms-side">
        <div>
          {NAV_ITEMS.map((item) => (
            <div
              className={`cms-side__item ${
                item.id === props.active ? 'cms-side__item--active' : ''
              }`}
            >
              {item.icon}
              {props.expanded && <span>{item.label}</span>}
            </div>
          ))}
        </div>
        <div className="cms-side__item">
          <IconSettings />
          {props.expanded && <span>Settings</span>}
        </div>
      </nav>
      <main className="cms-main">{props.children}</main>
    </div>
  );
}

/** Fixture users, keyed by first name. */
export const USERS: Record<string, {email: string; color: string}> = {
  Ada: {email: 'ada@lumen.example', color: '#7950f2'},
  Kenji: {email: 'kenji@lumen.example', color: '#1c7ed6'},
  Priya: {email: 'priya@lumen.example', color: '#e8590c'},
  Sam: {email: 'sam@lumen.example', color: '#2f9e44'},
  Lea: {email: 'lea@lumen.example', color: '#d6336c'},
};

export function Avatar(props: {name: string; large?: boolean}) {
  const user = USERS[props.name];
  return (
    <span
      className={`cms-avatar ${props.large ? 'cms-avatar--lg' : ''}`}
      style={{background: user?.color || '#868e96'}}
      title={props.name}
    >
      {props.name.slice(0, 1)}
    </span>
  );
}

export type BadgeVariant =
  'draft' | 'published' | 'scheduled' | 'locked' | 'release' | 'archived';

export function Badge(props: {variant: BadgeVariant; children: string}) {
  return (
    <span className={`cms-badge cms-badge--${props.variant}`}>
      {props.children}
    </span>
  );
}

export interface FieldProps {
  label: string;
  help?: string;
  /** Number of open comments, rendered as a blue bubble. */
  comments?: number;
  children?: ComponentChildren;
}

/** A labeled field row in the doc editor. */
export function Field(props: FieldProps) {
  return (
    <div className="cms-field">
      <div className="cms-field__label">
        {props.label}
        {!!props.comments && (
          <span className="cms-field__comments">{props.comments}</span>
        )}
      </div>
      {props.help && <div className="cms-field__help">{props.help}</div>}
      {props.children}
    </div>
  );
}

export function Input(props: {
  focused?: boolean;
  textarea?: boolean;
  children?: ComponentChildren;
}) {
  const classes = ['cms-input'];
  if (props.focused) classes.push('cms-input--focused');
  if (props.textarea) classes.push('cms-input--textarea');
  return <div className={classes.join(' ')}>{props.children}</div>;
}

/** A rich text field with a formatting toolbar. */
export function RichTextInput(props: {children?: ComponentChildren}) {
  return (
    <div className="cms-input cms-input--rte">
      <div className="cms-input__toolbar">
        <span>B</span>
        <span style={{fontStyle: 'italic'}}>I</span>
        <span style={{textDecoration: 'underline'}}>U</span>
        <span>H2</span>
        <span>•</span>
        <span>🔗</span>
      </div>
      <div className="cms-input__body">{props.children}</div>
    </div>
  );
}

/**
 * A decorative "photo" built from gradients, so scenes don't depend on any
 * external image assets.
 */
export function Artwork(props: {
  variant?: 'dawn' | 'forest' | 'dusk';
  className?: string;
  style?: preact.JSX.CSSProperties;
}) {
  const palettes = {
    dawn: [
      'radial-gradient(circle at 70% 35%, #ffe8a3 0 9%, transparent 10%)',
      'linear-gradient(180deg, transparent 58%, #2f4858 58% 70%, #1d3040 70%)',
      'linear-gradient(160deg, transparent 50%, #3d6b5e 50% 64%, transparent 64%)',
      'linear-gradient(180deg, #ffb88c 0%, #ffd9a0 45%, #f6f1d3 60%)',
    ],
    forest: [
      'linear-gradient(115deg, transparent 55%, #1b4332 55% 70%, transparent 70%)',
      'linear-gradient(65deg, transparent 40%, #2d6a4f 40% 62%, transparent 62%)',
      'linear-gradient(180deg, transparent 62%, #081c15 62%)',
      'linear-gradient(180deg, #b7e4c7 0%, #d8f3dc 55%)',
    ],
    dusk: [
      'radial-gradient(circle at 30% 40%, #fff3bf 0 6%, transparent 7%)',
      'linear-gradient(170deg, transparent 55%, #3b2c5c 55% 72%, transparent 72%)',
      'linear-gradient(180deg, transparent 66%, #1f1633 66%)',
      'linear-gradient(180deg, #5f3dc4 0%, #e599f7 55%, #ffc9c9 70%)',
    ],
  };
  return (
    <div
      className={props.className}
      style={{
        backgroundImage: palettes[props.variant || 'dawn'].join(','),
        ...props.style,
      }}
    />
  );
}
