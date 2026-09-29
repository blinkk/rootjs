import {IconColumns3, IconTable} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-tasks',
  width: 960,
  height: 600,
  alt: 'The Root CMS task board, with content tasks like writing alt text and reviewing German translations moving from new to in progress to in review, each with a priority, an assignee and a target launch date.',
};

type Priority = 'high' | 'medium' | 'normal';

interface TaskCard {
  id: number;
  title: string;
  description: ComponentChildren;
  opened: string;
  by: string;
  priority: Priority;
  assignee?: string;
  target?: string;
}

/** A doc id mentioned in a task description. */
function Doc(props: {children: string}) {
  return (
    <span
      className="cms-mono"
      style={{fontSize: '11px', color: '#495057', whiteSpace: 'nowrap'}}
    >
      {props.children}
    </span>
  );
}

const COLUMNS: Array<{label: string; tasks: TaskCard[]}> = [
  {
    label: 'New',
    tasks: [
      {
        id: 41,
        title: 'Write alt text for spring hero images',
        description: (
          <>
            Six new garden photos on <Doc>Pages/spring-harvest</Doc> and{' '}
            <Doc>Pages/produce</Doc> have no alt text yet.
          </>
        ),
        opened: 'Feb 16',
        by: 'ada',
        priority: 'medium',
        assignee: 'Sam',
        target: 'Mar 1',
      },
      {
        id: 42,
        title: 'Refresh prices in the root cellar guide',
        description: (
          <>
            <Doc>GrowingGuides/root-cellar</Doc> still lists winter prices for
            parsnips and turnips.
          </>
        ),
        opened: 'Feb 17',
        by: 'priya',
        priority: 'normal',
      },
    ],
  },
  {
    label: 'In progress',
    tasks: [
      {
        id: 38,
        title: 'Review German translations',
        description: (
          <>
            Check the strings Root AI translated on{' '}
            <Doc>Pages/spring-harvest</Doc> before the Mar 3 launch.
          </>
        ),
        opened: 'Feb 12',
        by: 'kenji',
        priority: 'high',
        assignee: 'Lea',
        target: 'Mar 3',
      },
      {
        id: 39,
        title: 'Make the spring hero headline punchier',
        description: (
          <>Shorter and fresher, per Priya’s comment on the hero title field.</>
        ),
        opened: 'Feb 13',
        by: 'priya',
        priority: 'normal',
        assignee: 'Kenji',
        target: 'Mar 3',
      },
    ],
  },
  {
    label: 'In review',
    tasks: [
      {
        id: 36,
        title: 'Add Chioggia beets to the shop',
        description: (
          <>
            New listing in the <Doc>products</Doc> data source and the product
            grid module.
          </>
        ),
        opened: 'Feb 9',
        by: 'sam',
        priority: 'medium',
        assignee: 'Priya',
        target: 'Mar 1',
      },
      {
        id: 35,
        title: 'Schedule the spring harvest release',
        description: (
          <>
            Add all 14 docs to <Doc>spring-harvest-2027</Doc> and schedule it
            for Mar 3.
          </>
        ),
        opened: 'Feb 8',
        by: 'kenji',
        priority: 'high',
        assignee: 'Ada',
        target: 'Mar 3',
      },
    ],
  },
];

const FILTERS = ['Active', 'Assigned to me', 'Created by me', 'Closed', 'All'];

const PRIORITY_COLORS: Record<Priority, [string, string]> = {
  high: ['#fde8e8', '#b42318'],
  medium: ['#fff4df', '#b56b16'],
  normal: ['#efefef', '#6b7280'],
};

/** A small pill used for a card's priority, assignee and target date. */
function Pill(props: {bg?: string; fg?: string; children: ComponentChildren}) {
  return (
    <span
      className="cms-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        height: '22px',
        padding: '0 8px',
        borderRadius: '999px',
        background: props.bg || '#efefef',
        color: props.fg || '#6b7280',
        fontSize: '10.5px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {props.children}
    </span>
  );
}

function Card(props: {task: TaskCard}) {
  const {task} = props;
  const [bg, fg] = PRIORITY_COLORS[task.priority];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
        padding: '11px 12px',
        background: '#fff',
        border: '1px solid var(--cms-border)',
        borderRadius: '6px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div style={{fontSize: '12.5px', fontWeight: 700, lineHeight: 1.35}}>
        {task.title}
      </div>
      <div className="cms-muted" style={{fontSize: '11.5px', lineHeight: 1.45}}>
        {task.description}
      </div>
      <div className="cms-mono cms-muted" style={{fontSize: '10.5px'}}>
        #{task.id} opened {task.opened} by {task.by}
      </div>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px'}}>
        <Pill bg={bg} fg={fg}>
          {task.priority}
        </Pill>
        {task.assignee ? (
          <Pill>
            <span style={{display: 'inline-flex', margin: '0 -2px 0 -6px'}}>
              <Avatar name={task.assignee} />
            </span>
            {task.assignee.toLowerCase()}
          </Pill>
        ) : (
          <Pill>Unassigned</Pill>
        )}
        {task.target && <Pill>target {task.target}</Pill>}
      </div>
    </div>
  );
}

/** The task manager page, showing active tasks on a board. */
export default function Tasks() {
  const count = COLUMNS.reduce((n, col) => n + col.tasks.length, 0);
  return (
    <CmsFrame active="tasks">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '26px 28px 20px',
          fontSize: '12.5px',
        }}
      >
        <div style={{display: 'flex', alignItems: 'baseline', gap: '10px'}}>
          <h1 className="cms-h1">Tasks</h1>
          <span className="cms-muted">{count} shown</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            margin: '20px 0 18px',
          }}
        >
          <div>
            <div style={{display: 'flex', gap: '6px'}}>
              {FILTERS.map((label, i) => (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '28px',
                    padding: '0 12px',
                    borderRadius: '999px',
                    border: `1px solid ${i === 0 ? '#1f1f1f' : 'var(--cms-border)'}`,
                    background: i === 0 ? '#1f1f1f' : '#fff',
                    color: i === 0 ? '#fff' : 'var(--cms-text)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              padding: '3px',
              borderRadius: '6px',
              background: '#f1f3f5',
              fontSize: '11.5px',
              fontWeight: 600,
            }}
          >
            {[
              [<IconTable size={14} />, 'Table'],
              [<IconColumns3 size={14} />, 'Board'],
            ].map(([icon, label], i) => (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  background: i === 1 ? '#fff' : 'transparent',
                  boxShadow: i === 1 ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                  color: i === 1 ? 'var(--cms-text)' : '#868e96',
                }}
              >
                {icon}
                {label}
              </span>
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '14px',
          }}
        >
          {COLUMNS.map((col) => (
            <section
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: '#f6f6f2',
                border: '1px solid var(--cms-border)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: '38px',
                  padding: '0 12px',
                  borderBottom: '1px solid var(--cms-border)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                }}
              >
                {col.label}
                <span
                  className="cms-mono"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '22px',
                    height: '20px',
                    padding: '0 7px',
                    borderRadius: '999px',
                    border: '1px solid var(--cms-border)',
                    background: '#fff',
                    color: '#6b7280',
                    fontSize: '10.5px',
                  }}
                >
                  {col.tasks.length}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  padding: '10px',
                }}
              >
                {col.tasks.map((task) => (
                  <Card task={task} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </CmsFrame>
  );
}
