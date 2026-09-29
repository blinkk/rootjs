import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCarrot,
  IconCheck,
  IconChecklist,
  IconChevronDown,
  IconDatabase,
  IconFolder,
  IconHome,
  IconLanguage,
  IconListCheck,
  IconPhoto,
  IconRobot,
  IconSearch,
  IconSeo,
  IconSettings,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import type {SceneMeta} from '../types.js';
import {Avatar, Badge, PROJECT_NAME} from '../ui/cms.js';
import {SproutMark} from '../ui/garden.js';

export const meta: SceneMeta = {
  id: 'cms-sidebar-tools',
  width: 960,
  height: 600,
  alt: 'A custom "Launch checklist" tool added to the Root.js CMS sidebar, showing an internal dashboard that tracks the tasks left before a scheduled release.',
};

const BUILT_IN_NAV: Array<{label: string; icon: ComponentChildren}> = [
  {label: 'Home', icon: <IconHome />},
  {label: 'Content', icon: <IconFolder />},
  {label: 'Tasks', icon: <IconChecklist />},
  {label: 'Releases', icon: <IconCalendarEvent />},
  {label: 'Data', icon: <IconDatabase />},
  {label: 'Asset Library', icon: <IconPhoto />},
  {label: 'Translations', icon: <IconLanguage />},
  {label: 'Root AI', icon: <IconRobot />},
];

/** Custom tools from the project's `sidebar.tools` config. */
const CUSTOM_TOOLS: Array<{
  label: string;
  icon: ComponentChildren;
  active?: boolean;
}> = [
  {label: 'Launch checklist', icon: <IconListCheck />, active: true},
  {label: 'SEO audit', icon: <IconSeo />},
  // Tools without an `icon` get the CMS's default carrot icon.
  {label: 'Harvest planner', icon: <IconCarrot />},
];

type TaskState = 'done' | 'open' | 'blocked';

const SECTIONS: Array<{
  title: string;
  tasks: Array<{label: string; owner: string; due: string; state: TaskState}>;
}> = [
  {
    title: 'Content',
    tasks: [
      {
        label: 'Hero copy approved',
        owner: 'Priya',
        due: 'Feb 20',
        state: 'done',
      },
      {
        label: 'Add two spring recipes',
        owner: 'Priya',
        due: 'Feb 26',
        state: 'open',
      },
    ],
  },
  {
    title: 'Localization',
    tasks: [
      {
        label: 'German and French translations',
        owner: 'Lea',
        due: 'Feb 23',
        state: 'done',
      },
      {
        label: 'Japanese translations · 3 strings missing',
        owner: 'Lea',
        due: 'Feb 27',
        state: 'blocked',
      },
    ],
  },
  {
    title: 'Assets & data',
    tasks: [
      {
        label: 'Hero art synced from Figma',
        owner: 'Kenji',
        due: 'Feb 24',
        state: 'done',
      },
      {
        label: 'Farm stand prices published',
        owner: 'Sam',
        due: 'Feb 24',
        state: 'done',
      },
      {
        label: 'Alt text on every image',
        owner: 'Kenji',
        due: 'Feb 25',
        state: 'open',
      },
    ],
  },
  {
    title: 'Sign-off',
    tasks: [
      {
        label: 'Mobile preview review',
        owner: 'Ada',
        due: 'Mar 1',
        state: 'open',
      },
      {
        label: 'Schedule the spring newsletter',
        owner: 'Ada',
        due: 'Mar 2',
        state: 'open',
      },
    ],
  },
];

/** A few of the docs in the `spring-harvest-2027` release. */
const RELEASE_DOCS = [
  'Pages/spring-harvest',
  'Pages/recipes',
  'GlobalModules/header',
];

const TOOL_GREEN = '#3a6b2c';

/** A task's checkbox, drawn in the tool's own (non-CMS) style. */
function TaskCheck(props: {state: TaskState}) {
  if (props.state === 'done') {
    return (
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 18px',
          height: '18px',
          borderRadius: '50%',
          background: TOOL_GREEN,
          color: '#fff',
        }}
      >
        <IconCheck size={12} stroke={3} />
      </span>
    );
  }
  if (props.state === 'blocked') {
    return (
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 18px',
          height: '18px',
          color: '#e67700',
        }}
      >
        <IconAlertTriangle size={17} />
      </span>
    );
  }
  return (
    <span
      style={{
        flex: '0 0 18px',
        height: '18px',
        borderRadius: '50%',
        border: '1.5px solid #c9c4b5',
      }}
    />
  );
}

/** The internal "Launch checklist" app, as rendered inside the tool iframe. */
function LaunchChecklist() {
  const tasks = SECTIONS.flatMap((s) => s.tasks);
  const done = tasks.filter((t) => t.state === 'done').length;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#faf8f2',
        color: '#2d2a24',
        fontSize: '12.5px',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          height: '52px',
          flex: '0 0 auto',
          padding: '0 24px',
          background: '#fff',
          borderBottom: '1px solid #ebe6d9',
        }}
      >
        <SproutMark size={20} />
        <span style={{fontSize: '15px', fontWeight: 700}}>
          Launch checklist
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginLeft: '10px',
            height: '28px',
            padding: '0 10px',
            border: '1px solid #ddd6c4',
            borderRadius: '6px',
            fontFamily: 'var(--cms-font-mono)',
            fontSize: '11.5px',
          }}
        >
          spring-harvest-2027
          <IconChevronDown size={13} />
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: '#7a7466',
            fontSize: '11.5px',
          }}
        >
          Fernwood internal tools
        </span>
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 220px',
          gap: '20px',
          padding: '20px 24px',
          minHeight: 0,
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid #ebe6d9',
            borderRadius: '10px',
            padding: '6px 16px 10px',
          }}
        >
          {SECTIONS.map((section) => (
            <div>
              <div
                style={{
                  margin: '10px 0 4px',
                  color: '#7a7466',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                }}
              >
                {section.title}
              </div>
              {section.tasks.map((task) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    height: '31px',
                  }}
                >
                  <TaskCheck state={task.state} />
                  <span
                    style={{
                      flex: 1,
                      color: task.state === 'done' ? '#8a8475' : undefined,
                      fontWeight: task.state === 'done' ? 400 : 500,
                    }}
                  >
                    {task.label}
                  </span>
                  <span style={{color: '#8a8475', fontSize: '11.5px'}}>
                    {task.due}
                  </span>
                  <Avatar name={task.owner} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              background: TOOL_GREEN,
              color: '#fff',
            }}
          >
            <div style={{fontSize: '11.5px', opacity: 0.8}}>Launches in</div>
            <div
              style={{
                fontSize: '34px',
                fontWeight: 700,
                letterSpacing: '-0.5px',
                lineHeight: 1.15,
              }}
            >
              7 days
            </div>
            <div style={{fontSize: '11.5px', opacity: 0.8}}>
              Mar 3, 2027 · 7:00 AM
            </div>
          </div>
          <div
            style={{
              padding: '14px 16px',
              background: '#fff',
              border: '1px solid #ebe6d9',
              borderRadius: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <span style={{fontWeight: 600}}>Progress</span>
              <span style={{color: '#7a7466', fontSize: '11.5px'}}>
                {done} of {tasks.length} done
              </span>
            </div>
            <div
              style={{
                height: '8px',
                margin: '10px 0 2px',
                borderRadius: '4px',
                background: '#efeadd',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(done / tasks.length) * 100}%`,
                  height: '100%',
                  background: '#6aa84f',
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
              padding: '14px 16px',
              background: '#fff',
              border: '1px solid #ebe6d9',
              borderRadius: '10px',
            }}
          >
            <span style={{fontWeight: 600}}>Release</span>
            <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              <Badge variant="scheduled">Scheduled</Badge>
              <span style={{color: '#7a7466', fontSize: '11.5px'}}>by Ada</span>
            </span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                fontFamily: 'var(--cms-font-mono)',
                fontSize: '11px',
              }}
            >
              {RELEASE_DOCS.map((docId) => (
                <span>{docId}</span>
              ))}
            </div>
            <span style={{color: '#7a7466', fontSize: '11.5px'}}>
              + 11 more docs · 1 data source
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The CMS with custom sidebar tools. The shared `CmsFrame` only renders the
 * built-in sections, so this scene rebuilds the frame with the same classes
 * and adds the project's tools between dividers, as the CMS does.
 */
export default function SidebarTools() {
  const divider = (
    <div
      style={{
        height: '1px',
        margin: '8px 0',
        background: 'var(--cms-border)',
      }}
    />
  );
  return (
    <div className="cms-app cms-app--expanded">
      <header className="cms-top">
        <div className="cms-top__logo">Root.js</div>
        <div className="cms-top__version">v3.5</div>
        <div className="cms-top__project">{PROJECT_NAME}</div>
        <div className="cms-top__search">
          <IconSearch size={14} />
          Search
          <kbd>⌘K</kbd>
        </div>
      </header>
      <nav className="cms-side">
        <div>
          {BUILT_IN_NAV.map((item) => (
            <div className="cms-side__item">
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
          {divider}
          {CUSTOM_TOOLS.map((tool) => (
            <div
              className={`cms-side__item ${
                tool.active ? 'cms-side__item--active' : ''
              }`}
            >
              {tool.icon}
              <span>{tool.label}</span>
            </div>
          ))}
          {divider}
        </div>
        <div className="cms-side__item">
          <IconSettings />
          <span>Settings</span>
        </div>
      </nav>
      <main className="cms-main">
        <LaunchChecklist />
      </main>
    </div>
  );
}
