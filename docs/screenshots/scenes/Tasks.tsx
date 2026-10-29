import {
  IconArrowsSort,
  IconBolt,
  IconCalendar,
  IconColumns3,
  IconInfinity,
  IconLayoutList,
  IconUser,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-tasks',
  width: 960,
  height: 600,
  alt: 'The Root.js CMS task board, with content tasks like writing alt text and reviewing German translations moving from new to in progress to in review, each with a priority, an assignee, and a target launch.',
};

/** Styles matching the CMS's `TaskManager` component. */
const TASKS_CSS = `
.tm {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px 28px;
  font-size: 12.5px;
}
.tm__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 16px;
}
.tm__actions { display: flex; align-items: center; gap: 8px; }
.tm__segmented {
  display: flex;
  padding: 2px;
  border: 1px solid #e4e4e1;
  border-radius: 6px;
  background: #f5f5f3;
  font-size: 11.5px;
  font-weight: 500;
}
.tm__segmented > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 4px;
  color: #495057;
}
.tm__segmented > span.active {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  color: var(--cms-text);
}
.tm__count {
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #6b7280;
  font-size: 10px;
  line-height: 14px;
}
.tm__sort {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #e4e4e1;
  border-radius: 7px;
  background: #fff;
  font-size: 11.5px;
}
.tm__board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.tm__column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: #f1f3f5;
}
.tm__column--in-progress { background: #eef3fd; }
.tm__column--in-review { background: #fdf3ea; }
.tm__column__header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 3px 3px;
  font-size: 12px;
  font-weight: 600;
}
.tm__column__count { color: #4b5563; font-size: 11px; font-weight: 400; }
.tm__ring {
  width: 12px;
  height: 12px;
  border: 1.5px solid #9ca3af;
  border-radius: 50%;
  box-sizing: border-box;
}
.tm__ring--new { border-style: dashed; }
.tm__ring--in-progress {
  padding: 1.5px;
  border-color: #2563eb;
  background: conic-gradient(#2563eb 0 50%, transparent 0) content-box;
}
.tm__ring--in-review {
  padding: 1.5px;
  border-color: #c2410c;
  background: conic-gradient(#c2410c 0 75%, transparent 0) content-box;
}
.tm__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 12px;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 0 0 1px rgba(16, 24, 40, 0.05);
}
.tm__card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tm__card__id { color: #6b7280; font-size: 11px; }
.tm__card__title { font-size: 12.5px; font-weight: 600; line-height: 1.35; }
.tm__card__description {
  display: -webkit-box;
  overflow: hidden;
  color: #5b616b;
  font-size: 11.5px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.tm__card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 7px;
  border-top: 1px solid #f1f1ee;
}
.tm__date {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #6b7280;
  font-size: 11px;
}
.tm__date svg { color: #5b616b; }
.tm__asap {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #fdecea;
  color: #9b1c1c;
  font-size: 10px;
  font-weight: 700;
}
.tm__unassigned {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px dashed #c9c9c4;
  border-radius: 50%;
  color: #9ca3af;
}
.tm__priority {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 8px;
  border-radius: 999px;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.tm__priority--high { background: linear-gradient(35deg, #fa5252, #be4bdb); }
.tm__priority--medium { background: linear-gradient(45deg, #fd7e14, #fa5252); }
.tm__priority--normal { background: linear-gradient(45deg, #4c6ef5, #15aabf); }
`;

type Priority = 'high' | 'medium' | 'normal';

interface TaskCard {
  id: number;
  title: string;
  description: string;
  priority: Priority;
  assignee?: string;
  /** A short date like "Mar 1", or "asap" or "anytime". */
  target: string;
}

const COLUMNS: Array<{status: string; label: string; tasks: TaskCard[]}> = [
  {
    status: 'new',
    label: 'New',
    tasks: [
      {
        id: 41,
        title: 'Write alt text for spring hero images',
        description:
          'Six new garden photos on Pages/spring-harvest and Pages/produce have no alt text yet.',
        priority: 'medium',
        assignee: 'Sam',
        target: 'Mar 1',
      },
      {
        id: 42,
        title: 'Refresh prices in the root cellar guide',
        description:
          'GrowingGuides/root-cellar still lists winter prices for parsnips and turnips.',
        priority: 'normal',
        target: 'anytime',
      },
    ],
  },
  {
    status: 'in-progress',
    label: 'In progress',
    tasks: [
      {
        id: 38,
        title: 'Review German translations',
        description:
          'Check the strings Root AI translated on Pages/spring-harvest before the Mar 3 launch.',
        priority: 'high',
        assignee: 'Lea',
        target: 'Mar 3',
      },
      {
        id: 39,
        title: 'Make the spring hero headline punchier',
        description:
          'Shorter and fresher, per Priya’s comment on the hero title field.',
        priority: 'normal',
        assignee: 'Kenji',
        target: 'Mar 3',
      },
    ],
  },
  {
    status: 'in-review',
    label: 'In review',
    tasks: [
      {
        id: 36,
        title: 'Fix the sold-out badge on Chioggia beets',
        description:
          'The product grid still shows them in stock after the last harvest sold out.',
        priority: 'high',
        assignee: 'Priya',
        target: 'asap',
      },
      {
        id: 35,
        title: 'Schedule the spring harvest release',
        description:
          'Add all 14 docs to spring-harvest-2027 and schedule it for Mar 3.',
        priority: 'medium',
        assignee: 'Ada',
        target: 'Mar 3',
      },
    ],
  },
];

const FILTERS: Array<[string, number]> = [
  ['Active', 6],
  ['Assigned to me', 1],
  ['Created by me', 3],
  ['Closed', 18],
  ['All', 24],
];

/** A task's target launch, as rendered by `TaskTargetLaunchLabel`. */
function TargetLaunch(props: {target: string}) {
  if (props.target === 'asap') {
    return (
      <span className="tm__asap">
        <IconBolt size={10} strokeWidth={2.4} />
        ASAP
      </span>
    );
  }
  return (
    <span className="tm__date">
      {props.target === 'anytime' ? (
        <IconInfinity size={13} strokeWidth={1.8} />
      ) : (
        <IconCalendar size={13} strokeWidth={1.8} />
      )}
      {props.target === 'anytime' ? 'Anytime' : props.target}
    </span>
  );
}

function Card(props: {task: TaskCard}) {
  const {task} = props;
  return (
    <div className="tm__card">
      <div className="tm__card__header">
        <span className="tm__card__id">#{task.id}</span>
        <span className={`tm__priority tm__priority--${task.priority}`}>
          {task.priority}
        </span>
      </div>
      <div className="tm__card__title">{task.title}</div>
      <div className="tm__card__description">{task.description}</div>
      <div className="tm__card__footer">
        <TargetLaunch target={task.target} />
        {task.assignee ? (
          <Avatar name={task.assignee} />
        ) : (
          <span className="tm__unassigned">
            <IconUser size={11} strokeWidth={2} />
          </span>
        )}
      </div>
    </div>
  );
}

/** The task manager page, showing active tasks on a board. */
export default function Tasks() {
  return (
    <CmsFrame active="tasks">
      <style>{TASKS_CSS}</style>
      <div className="tm">
        <h1 className="cms-h1">Tasks</h1>
        <div className="tm__header">
          <div className="tm__segmented">
            {FILTERS.map(([label, count], i) => (
              <span className={i === 0 ? 'active' : ''}>
                {label}
                <span className="tm__count">{count}</span>
              </span>
            ))}
          </div>
          <div className="tm__actions">
            <span className="tm__sort">
              <IconArrowsSort size={14} strokeWidth={1.8} />
              Priority
            </span>
            <div className="tm__segmented">
              <span>
                <IconLayoutList size={14} strokeWidth={1.8} />
                List
              </span>
              <span className="active">
                <IconColumns3 size={14} strokeWidth={1.8} />
                Board
              </span>
            </div>
          </div>
        </div>
        <div className="tm__board">
          {COLUMNS.map((col) => (
            <section className={`tm__column tm__column--${col.status}`}>
              <div className="tm__column__header">
                <span className={`tm__ring tm__ring--${col.status}`} />
                {col.label}
                <span className="tm__column__count">{col.tasks.length}</span>
              </div>
              {col.tasks.map((task) => (
                <Card task={task} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </CmsFrame>
  );
}
