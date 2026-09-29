/**
 * Building blocks for recreating the Root CMS UI in screenshot scenes. The
 * markup and class names are simplified, but sizes, colors and iconography
 * follow the real CMS (see `packages/root-cms/ui/layout/Layout.tsx`).
 */

import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconBraces,
  IconCalendarEvent,
  IconChecklist,
  IconDatabase,
  IconDeviceFloppy,
  IconFolder,
  IconHome,
  IconLanguage,
  IconLayoutSidebarRightCollapse,
  IconMessageCircle,
  IconPhoto,
  IconRobot,
  IconRocket,
  IconSearch,
  IconSettings,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import './cms.css';

/** Name of the fictional project shown in the CMS header. */
export const PROJECT_NAME = 'Fernwood Market';

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
  {id: 'ai', label: 'Root AI', icon: <IconRobot />},
];

export interface CmsFrameProps {
  /** Highlighted sidebar section. */
  active?: NavId;
  /** Whether to show the expanded (labeled) sidebar. */
  expanded?: boolean;
  /**
   * Content for the right side of the top bar. Defaults to the search bar. Doc
   * pages show a `<DocStatusBar>` here instead.
   */
  topRight?: ComponentChildren;
  children?: ComponentChildren;
}

/** The CMS app chrome: top bar, sidebar and a main content slot. */
export function CmsFrame(props: CmsFrameProps) {
  return (
    <div className={`cms-app ${props.expanded ? 'cms-app--expanded' : ''}`}>
      <header className="cms-top">
        <div className="cms-top__logo">Root.js</div>
        <div className="cms-top__version">v3.5</div>
        <div className="cms-top__project">{PROJECT_NAME}</div>
        {props.topRight || (
          <div className="cms-top__search">
            <IconSearch size={14} />
            Search
            <kbd>⌘K</kbd>
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
  Ada: {email: 'ada@fernwood.example', color: '#7950f2'},
  Kenji: {email: 'kenji@fernwood.example', color: '#1c7ed6'},
  Priya: {email: 'priya@fernwood.example', color: '#e8590c'},
  Sam: {email: 'sam@fernwood.example', color: '#2f9e44'},
  Lea: {email: 'lea@fernwood.example', color: '#d6336c'},
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

/** A button in the doc status bar's tool group. */
export type DocTool = 'search' | 'comments' | 'checks' | 'ai';

export interface DocStatusBarProps {
  /** Other people viewing the doc. */
  viewers?: string[];
  /** Save state text, e.g. "Saved just now". */
  saveState: string;
  badges: Array<[BadgeVariant, string]>;
  /** The tool panel that is open, if any. */
  activeTool?: DocTool;
  /** Number of open comments, shown on the comments button. */
  comments?: number;
}

/**
 * The doc status bar that the real CMS pins to the top right of the app header
 * on doc pages (see `DocEditor.StatusBar`). The localization button is omitted
 * to keep the mock focused.
 */
export function DocStatusBar(props: DocStatusBarProps) {
  const tool = (id: DocTool) =>
    `cms-button ${props.activeTool === id ? 'cms-button--active' : ''}`;
  return (
    <div className="cms-status">
      {props.viewers && (
        <div className="cms-status__viewers">
          {props.viewers.map((name) => (
            <Avatar name={name} />
          ))}
        </div>
      )}
      <span className="cms-status__save">{props.saveState}</span>
      {props.badges.map(([variant, label]) => (
        <Badge variant={variant}>{label}</Badge>
      ))}
      <div className="cms-button-group">
        <span className={tool('search')}>
          <IconSearch />
        </span>
        <span className={tool('comments')}>
          <IconMessageCircle />
          {!!props.comments && props.comments}
        </span>
        <span className={tool('checks')}>
          <IconChecklist />
        </span>
        <span className={tool('ai')}>
          <IconRobot />
          AI
        </span>
      </div>
      <span className="cms-button cms-button--dark">
        <IconRocket />
        Publish
      </span>
    </div>
  );
}

/** The editor side's header: back, doc id, undo/redo, save and view toggles. */
export function EditorHeader(props: {docId: string}) {
  return (
    <div className="cms-editor__bar">
      <span className="cms-icon-button">
        <IconArrowLeft />
      </span>
      <span className="cms-editor__docid">{props.docId}</span>
      <span className="cms-icon-button">
        <IconArrowBackUp />
      </span>
      <span className="cms-icon-button">
        <IconArrowForwardUp />
      </span>
      <span className="cms-button cms-button--dark" style={{height: '24px'}}>
        <IconDeviceFloppy />
        Save
      </span>
      <span className="cms-icon-button">
        <IconBraces />
      </span>
      <span className="cms-icon-button">
        <IconLayoutSidebarRightCollapse />
      </span>
    </div>
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
