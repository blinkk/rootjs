import './CollectionTree.css';
import {Accordion} from '@mantine/core';
import {IconBox, IconFolder} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useMemo} from 'preact/hooks';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  buildCollectionTree,
  CollectionNode,
  filterCollectionTree,
} from '../../utils/collection-tree.js';

interface CollectionTreeProps {
  collections: Record<string, any>;
  activeCollectionId?: string;
  query?: string;
  projectId: string;
}

export function CollectionTree(props: CollectionTreeProps) {
  const {collections, activeCollectionId, query = '', projectId} = props;
  const [openGroups, setOpenGroups] = useLocalStorage<string[]>(
    `root-cms::${projectId}::open_groups`,
    // Default to having "Default" group open.
    ['group:Default']
  );

  const collectionTree = useMemo(
    () => buildCollectionTree(collections),
    [collections]
  );
  const filteredTree = useMemo(
    () => filterCollectionTree(collectionTree, query),
    [collectionTree, query]
  );

  const handleAccordionChange = (groupId: string, isOpen: boolean) => {
    if (isOpen) {
      if (!openGroups.includes(groupId)) {
        setOpenGroups([...openGroups, groupId]);
      }
    } else {
      setOpenGroups(openGroups.filter((id) => id !== groupId));
    }
  };

  const renderAccordion = (
    node: CollectionNode,
    depth: number,
    label: ComponentChildren
  ) => {
    const isOpen = openGroups.includes(node.id);

    return (
      <div
        key={node.id}
        className="CollectionTree__accordion"
        style={{paddingLeft: `${depth * 16}px`}}
      >
        <Accordion
          transitionDuration={0}
          iconPosition="right"
          initialItem={isOpen ? 0 : -1}
          onChange={() => handleAccordionChange(node.id, !isOpen)}
        >
          <Accordion.Item label={label}>
            <div className="CollectionTree__accordion__children">
              {node.children.map((child) =>
                renderCollectionNode(child, depth + 1)
              )}
            </div>
          </Accordion.Item>
        </Accordion>
      </div>
    );
  };

  const renderCollectionNode = (node: CollectionNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;

    if (node.isGroup) {
      // Render a group node using Accordion.
      if (!hasChildren) {
        // Group with no children, just render the label.
        return (
          <div
            key={node.id}
            className="CollectionTree__group-empty"
            style={{paddingLeft: `${depth * 16}px`}}
          >
            <IconFolder size={20} strokeWidth="1.75" />
            <span>{node.name}</span>
          </div>
        );
      }

      return renderAccordion(
        node,
        depth,
        <div className="CollectionTree__group__label">
          <IconBox size={20} strokeWidth="1.75" />
          <span>{node.name}</span>
        </div>
      );
    } else {
      // Render a collection node.
      if (hasChildren) {
        return renderAccordion(
          node,
          depth,
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
        );
      } else {
        // Collection without children - simple link.
        return (
          <a
            key={node.id}
            className={joinClassNames(
              'CollectionTree__collection',
              node.id === activeCollectionId && 'active'
            )}
            href={`/cms/content/${node.id}`}
            style={{paddingLeft: `${depth * 16 + 8}px`}}
          >
            <div className="CollectionTree__collection__icon">
              <IconFolder size={20} strokeWidth="1.75" />
            </div>
            <div className="CollectionTree__collection__content">
              <div className="CollectionTree__collection__name">
                {node.name}
              </div>
              {node.description && (
                <div className="CollectionTree__collection__desc">
                  {node.description}
                </div>
              )}
            </div>
          </a>
        );
      }
    }
  };

  return (
    <>
      {filteredTree.map((node) => renderCollectionNode(node))}
      {filteredTree.length === 0 && (
        <div className="CollectionTree__collections__empty">
          No collections match your query.
        </div>
      )}
    </>
  );
}
