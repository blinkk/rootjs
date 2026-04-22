import './CollectionTree.css';

import {Accordion} from '@mantine/core';
import {IconFolder} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useMemo} from 'preact/hooks';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  buildCollectionTree,
  CollectionNode,
} from '../../utils/collection-tree.js';

interface CollectionTreeProps {
  className?: string;
  collections: Record<string, any>;
  activeCollectionId?: string;
  projectId: string;
}

export function CollectionTree(props: CollectionTreeProps) {
  const {collections, activeCollectionId, projectId} = props;
  // Track closed groups instead of open groups so that new groups default to open.
  const [closedGroups, setClosedGroups] = useLocalStorage<string[]>(
    `root-cms::${projectId}::closed_groups`,
    []
  );

  const collectionTree = useMemo(() => buildCollectionTree(collections), []);

  const handleAccordionChange = (groupId: string, isOpen: boolean) => {
    if (isOpen) {
      setClosedGroups(closedGroups.filter((id) => id !== groupId));
    } else {
      if (!closedGroups.includes(groupId)) {
        setClosedGroups([...closedGroups, groupId]);
      }
    }
  };

  return (
    <div className={joinClassNames(props.className, 'CollectionTree')}>
      {collectionTree.map((node) => (
        <CollectionNodeItem
          key={node.id}
          node={node}
          depth={0}
          activeCollectionId={activeCollectionId}
          closedGroups={closedGroups}
          onAccordionChange={handleAccordionChange}
        />
      ))}
      {collectionTree.length === 0 && (
        <div className="CollectionTree__collections__empty">
          No collections match your query.
        </div>
      )}
    </div>
  );
}

interface CollectionNodeItemProps {
  node: CollectionNode;
  depth: number;
  activeCollectionId?: string;
  closedGroups: string[];
  onAccordionChange: (groupId: string, isOpen: boolean) => void;
}

/** Renders a single node in the collection tree (group or collection). */
function CollectionNodeItem(props: CollectionNodeItemProps) {
  const {node, depth, activeCollectionId, closedGroups, onAccordionChange} =
    props;
  const hasChildren = node.children.length > 0;

  if (node.isGroup) {
    // Render a group node using Accordion.
    if (!hasChildren) {
      // Group with no children, just render the label.
      return (
        <div
          className="CollectionTree__group-empty"
          style={{paddingLeft: `${depth * 16}px`}}
        >
          <IconFolder size={20} strokeWidth="1.75" />
          <span>{node.name}</span>
        </div>
      );
    }

    return (
      <CollectionAccordion
        node={node}
        depth={depth}
        activeCollectionId={activeCollectionId}
        closedGroups={closedGroups}
        onAccordionChange={onAccordionChange}
        label={
          <div className="CollectionTree__group__label">
            <span>{node.name}</span>
          </div>
        }
      />
    );
  }

  // Render a collection node.
  if (hasChildren) {
    return (
      <CollectionAccordion
        node={node}
        depth={depth}
        activeCollectionId={activeCollectionId}
        closedGroups={closedGroups}
        onAccordionChange={onAccordionChange}
        label={
          <div className="CollectionTree__collection__label">
            <a
              className={joinClassNames(
                'CollectionTree__collection-link',
                node.id === activeCollectionId && 'active'
              )}
              href={`/cms/content/${node.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              {node.name}
            </a>
          </div>
        }
      />
    );
  }

  // Collection without children - simple link.
  return (
    <a
      className={joinClassNames(
        'CollectionTree__collection',
        node.id === activeCollectionId && 'active'
      )}
      href={`/cms/content/${node.id}`}
    >
      <div className="CollectionTree__collection__icon">
        <IconFolder size={20} strokeWidth="1.75" />
      </div>
      <div className="CollectionTree__collection__content">
        <div className="CollectionTree__collection__name">{node.name}</div>
        {node.description && (
          <div className="CollectionTree__collection__desc">
            {node.description}
          </div>
        )}
      </div>
    </a>
  );
}

interface CollectionAccordionProps {
  node: CollectionNode;
  depth: number;
  label: ComponentChildren;
  activeCollectionId?: string;
  closedGroups: string[];
  onAccordionChange: (groupId: string, isOpen: boolean) => void;
}

/** Renders an accordion wrapper for a collection tree node with children. */
function CollectionAccordion(props: CollectionAccordionProps) {
  const {
    node,
    depth,
    label,
    activeCollectionId,
    closedGroups,
    onAccordionChange,
  } = props;
  const isOpen = !closedGroups.includes(node.id);

  return (
    <div className="CollectionTree__accordion">
      <Accordion
        iconPosition="left"
        initialItem={isOpen ? 0 : -1}
        offsetIcon={false}
        onChange={() => onAccordionChange(node.id, !isOpen)}
      >
        <Accordion.Item label={label}>
          <div className="CollectionTree__accordion__children">
            {node.children.map((child) => (
              <CollectionNodeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                activeCollectionId={activeCollectionId}
                closedGroups={closedGroups}
                onAccordionChange={onAccordionChange}
              />
            ))}
          </div>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
