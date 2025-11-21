/**
 * Utilities for building hierarchical tree structures from flat collection lists.
 */

export interface CollectionNode {
  id: string;
  name: string;
  description?: string;
  isGroup: boolean; // true if this is just a grouping node without an actual collection
  collection?: any; // the actual collection object if isGroup is false
  children: CollectionNode[];
}

/**
 * Builds a hierarchical tree structure from a flat list of collections.
 * Collections with a `folder` field are nested under that folder.
 * Folders are always virtual groups - collections cannot be used as folders.
 */
export function buildCollectionTree(
  collections: Record<string, any>
): CollectionNode[] {
  const nodes: Record<string, CollectionNode> = {};
  const roots: CollectionNode[] = [];

  const folders: Record<string, CollectionNode> = {};

  // First pass: create nodes for all collections
  Object.entries(collections).forEach(([id, collection]) => {
    nodes[id] = {
      id,
      name: collection.name || id,
      description: collection.description,
      isGroup: false,
      collection,
      children: [],
    };
  });

  // Second pass: organize into tree structure
  Object.entries(collections).forEach(([id, collection]) => {
    const node = nodes[id];
    const folderId = collection.folder;

    if (folderId) {
      // Create folder if it doesn't exist
      if (!folders[folderId]) {
        folders[folderId] = {
          id: `folder:${folderId}`,
          name: folderId,
          isGroup: true,
          children: [],
        };
      }
      // Add collection to folder
      folders[folderId].children.push(node);
    } else {
      // No folder - this is a root node
      roots.push(node);
    }
  });

  // Add all folders to roots
  Object.values(folders).forEach((folder) => {
    roots.push(folder);
  });

  // Sort children alphabetically
  const sortNodes = (nodeList: CollectionNode[]) => {
    nodeList.sort((a, b) => a.name.localeCompare(b.name));
    nodeList.forEach((node) => {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };
  sortNodes(roots);

  return roots;
}

/**
 * Filters the collection tree based on a search query.
 * Returns a new tree with only nodes that match the query or have matching descendants.
 */
export function filterCollectionTree(
  nodes: CollectionNode[],
  query: string
): CollectionNode[] {
  if (!query) {
    return nodes;
  }

  const lowerQuery = query.toLowerCase();

  const filterNode = (node: CollectionNode): CollectionNode | null => {
    const nameMatches = node.name.toLowerCase().includes(lowerQuery);
    const idMatches = node.id.toLowerCase().includes(lowerQuery);
    const descMatches = node.description?.toLowerCase().includes(lowerQuery);

    const filteredChildren = node.children
      .map(filterNode)
      .filter((child): child is CollectionNode => child !== null);

    // Include node if it matches or has matching children
    if (
      nameMatches ||
      idMatches ||
      descMatches ||
      filteredChildren.length > 0
    ) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  };

  return nodes
    .map(filterNode)
    .filter((node): node is CollectionNode => node !== null);
}
