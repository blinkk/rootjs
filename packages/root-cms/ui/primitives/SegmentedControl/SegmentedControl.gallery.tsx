import {IconLayoutGrid, IconLayoutList} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {
  SegmentedControl,
  type SegmentedControlProps,
} from './SegmentedControl.js';

/** Holds the selected value, so the gallery examples are interactive. */
function Demo(
  props: Omit<SegmentedControlProps, 'value' | 'onValueChange'> & {
    initial: string;
  }
) {
  const {initial, ...rest} = props;
  const [value, setValue] = useState(initial);
  return <SegmentedControl {...rest} value={value} onValueChange={setValue} />;
}

function Count(props: {children: ComponentChildren}) {
  return (
    <span className="rounded-full bg-chip px-1.5 text-xs text-fg">
      {props.children}
    </span>
  );
}

export const SegmentedControlGallery = defineGallery({
  id: 'segmented-control',
  name: 'SegmentedControl',
  group: 'Primitives',
  stories: {
    Sizes: () => (
      <div className="flex flex-col items-start gap-3">
        <Demo
          aria-label="View, extra small"
          size="xs"
          initial="changes"
          data={[
            {value: 'changes', label: 'Changes'},
            {value: 'json', label: 'JSON'},
          ]}
        />
        <Demo
          aria-label="View, small"
          size="sm"
          initial="overview"
          data={['overview', 'changes', 'history']}
        />
        <Demo
          aria-label="View, medium"
          size="md"
          initial="simple"
          data={[
            {value: 'simple', label: 'Simple'},
            {value: 'ai', label: 'Generate with AI'},
          ]}
        />
      </div>
    ),
    'Icons and counts': () => (
      <div className="flex flex-col items-start gap-3">
        <Demo
          aria-label="Layout"
          size="xs"
          initial="list"
          data={[
            {
              value: 'list',
              label: <IconLayoutList size={14} />,
              ariaLabel: 'List layout',
            },
            {
              value: 'grid',
              label: <IconLayoutGrid size={14} />,
              ariaLabel: 'Grid layout',
            },
          ]}
        />
        <Demo
          aria-label="Task filters"
          initial="open"
          data={[
            {
              value: 'open',
              label: (
                <>
                  Open <Count>12</Count>
                </>
              ),
            },
            {
              value: 'mine',
              label: (
                <>
                  Mine <Count>3</Count>
                </>
              ),
            },
            {
              value: 'done',
              label: (
                <>
                  Done <Count>48</Count>
                </>
              ),
            },
          ]}
        />
      </div>
    ),
    'Full width and overflow': () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Demo
          aria-label="Comment filter"
          size="xs"
          fullWidth
          initial="open"
          data={[
            {value: 'open', label: 'Open (4)'},
            {value: 'resolved', label: 'Resolved (10)'},
            {value: 'all', label: 'All'},
          ]}
        />
        <Demo
          label="Release filters"
          description="Scrolls sideways when it doesn't fit."
          initial="scheduled"
          data={[
            {value: 'all', label: 'All releases'},
            {value: 'scheduled', label: 'Scheduled'},
            {value: 'published', label: 'Published'},
            {value: 'archived', label: 'Archived'},
            {value: 'drafts', label: 'Drafts', disabled: true},
          ]}
        />
      </div>
    ),
    States: () => (
      <div className="flex flex-col items-start gap-3">
        <Demo
          aria-label="Disabled control"
          disabled
          initial="a"
          data={['a', 'b', 'c']}
        />
      </div>
    ),
  },
});
