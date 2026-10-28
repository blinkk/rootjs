import {IconFolder} from '@tabler/icons-preact';
import {useMemo} from 'preact/hooks';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {
  Accordion,
  AccordionItem,
} from '../../../../primitives/Accordion/Accordion.js';
import {cn} from '../../../../utils/classes.js';
import {buildCollectionTree, CollectionNode} from '../../collection-tree.js';

interface CollectionTreeProps {
  className?: string;
  collections: Record<string, any>;
  activeCollectionId?: string;
  projectId: string;
}

/**
 * The project's collections as cards, grouped into collapsible sections by
 * their schema's `group`. Which groups are collapsed is remembered per
 * project.
 */
export function CollectionTree(props: CollectionTreeProps) {
  const {collections, activeCollectionId, projectId} = props;
  // Track closed groups instead of open groups so that new groups default to open.
  const [closedGroups, setClosedGroups] = useLocalStorage<string[]>(
    `root-cms::${projectId}::closed_groups`,
    []
  );

  const collectionTree = useMemo(() => buildCollectionTree(collections), []);

  // Groups with children are collapsible sections of the accordion.
  const groupIds = collectionTree
    .filter((node) => node.children.length > 0)
    .map((node) => node.id);
  const openGroups = groupIds.filter((id) => !closedGroups.includes(id));

  const onAccordionChange = (open: string[]) => {
    // Keep closed groups that aren't in this tree (e.g. hidden by a filter).
    const otherClosed = closedGroups.filter((id) => !groupIds.includes(id));
    const closed = groupIds.filter((id) => !open.includes(id));
    setClosedGroups([...otherClosed, ...closed]);
  };

  return (
    <div className={cn('CollectionTree flex flex-col', props.className)}>
      <Accordion
        className="CollectionTree__accordion"
        multiple
        chevronPosition="left"
        value={openGroups}
        onChange={onAccordionChange}
      >
        {collectionTree.map((node) => (
          <CollectionNodeItem
            key={node.id}
            node={node}
            activeCollectionId={activeCollectionId}
          />
        ))}
      </Accordion>
      {collectionTree.length === 0 && (
        <div className="CollectionTree__collections__empty px-3 py-2 text-base">
          No collections match your query.
        </div>
      )}
    </div>
  );
}

interface CollectionNodeItemProps {
  node: CollectionNode;
  activeCollectionId?: string;
}

/** Renders a single node in the collection tree (group or collection). */
function CollectionNodeItem(props: CollectionNodeItemProps) {
  const {node, activeCollectionId} = props;
  const hasChildren = node.children.length > 0;

  if (node.isGroup && !hasChildren) {
    // Group with no children, just render the label.
    return (
      <div className="CollectionTree__group-empty flex items-center gap-3 px-2 py-3 text-base font-semibold text-fg">
        <IconFolder size={20} strokeWidth="1.75" />
        <span>{node.name}</span>
      </div>
    );
  }

  if (node.isGroup) {
    return (
      <AccordionItem
        className="CollectionTree__group border-b-0"
        value={node.id}
        label={
          <span className="CollectionTree__group__label font-semibold">
            {node.name}
          </span>
        }
      >
        <CollectionChildren
          nodes={node.children}
          activeCollectionId={activeCollectionId}
        />
      </AccordionItem>
    );
  }

  // Collections can't hold other collections (only groups can), but render
  // any children below the collection's card just in case.
  return (
    <>
      <CollectionCard node={node} active={node.id === activeCollectionId} />
      {hasChildren && (
        <div className="CollectionTree__collection__children mt-2 pl-4">
          <CollectionChildren
            nodes={node.children}
            activeCollectionId={activeCollectionId}
          />
        </div>
      )}
    </>
  );
}

/** The cards inside a group. */
function CollectionChildren(props: {
  nodes: CollectionNode[];
  activeCollectionId?: string;
}) {
  return (
    <div className="CollectionTree__accordion__children flex flex-col gap-2">
      {props.nodes.map((child) =>
        child.isGroup ? (
          <div key={child.id} className="CollectionTree__subgroup">
            <div className="CollectionTree__group__label px-1 py-2 text-base font-semibold text-fg">
              {child.name}
            </div>
            <CollectionChildren
              nodes={child.children}
              activeCollectionId={props.activeCollectionId}
            />
          </div>
        ) : (
          <CollectionCard
            key={child.id}
            node={child}
            active={child.id === props.activeCollectionId}
          />
        )
      )}
    </div>
  );
}

/** A link to a collection, showing its name and description. */
function CollectionCard(props: {node: CollectionNode; active: boolean}) {
  const {node, active} = props;
  return (
    <a
      className={cn(
        'CollectionTree__collection',
        'flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-base font-medium text-fg no-underline transition-colors',
        'hover:bg-surface-hover active:translate-y-0.5 active:bg-surface-active',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'current:border-muted current:text-strong'
      )}
      href={`/cms/content/${node.id}`}
      aria-current={active ? 'page' : undefined}
    >
      <div className="CollectionTree__collection__icon mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-chip">
        <IconFolder className="w-4" size={20} strokeWidth="1.75" />
      </div>
      <div className="CollectionTree__collection__content flex min-w-0 flex-col">
        <div className="CollectionTree__collection__name">{node.name}</div>
        {node.description && (
          <div className="CollectionTree__collection__desc text-sm text-muted">
            {node.description}
          </div>
        )}
      </div>
    </a>
  );
}
