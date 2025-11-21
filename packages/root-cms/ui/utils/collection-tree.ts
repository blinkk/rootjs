/**
 * Utilities for building hierarchical tree structures from flat collection lists.
 */

/**
 * Represents a node in the collection tree, which can be either a collection
 * or a virtual folder grouping.
 */
export interface CollectionNode {
  /** Unique identifier for the node. */
  id: string;
  /** Display name of the collection or folder. */
  name: string;
  /** Optional description text. */
  description?: string;
  /**
   * True if this is just a grouping node without an actual collection.
   * False if this represents an actual collection.
   */
  isGroup: boolean;
  /** The actual collection object if isGroup is false. */
  collection?: any;
  /** Child nodes (collections or folders) under this node. */
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

  // First pass: create nodes for all collections.
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

  // Second pass: organize into tree structure.
  Object.entries(collections).forEach(([id, collection]) => {
    const node = nodes[id];
    const folderId = collection.folder;

    if (folderId) {
      // Create folder if it doesn't exist.
      if (!folders[folderId]) {
        folders[folderId] = {
          id: `folder:${folderId}`,
          name: folderId,
          isGroup: true,
          children: [],
        };
      }
      // Add collection to folder.
      folders[folderId].children.push(node);
    } else {
      // No folder - this is a root node.
      roots.push(node);
    }
  });

  // If any folders exist, create a Default folder for collections without folders.
  const hasFolders = Object.keys(folders).length > 0;
  if (hasFolders && roots.length > 0) {
    const defaultFolder: CollectionNode = {
      id: 'folder:Default',
      name: 'Default',
      isGroup: true,
      children: roots,
    };
    // Replace roots with just the Default folder and other folders.
    // Sort other folders alphabetically, but keep Default at the top.
    const otherFolders = Object.values(folders).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    return [defaultFolder, ...otherFolders];
  }

  // Add all folders to roots.
  Object.values(folders).forEach((folder) => {
    roots.push(folder);
  });

  // Sort children alphabetically.
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

    // Include node if it matches or has matching children.
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
