import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconPhoto,
  IconRefresh,
  IconUpload,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Surface} from '../../components/Surface/Surface.js';
import {Text} from '../../components/Text/Text.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import type {
  LibraryAsset,
  LibraryAssetFolder,
} from '../../utils/asset-library.js';
import {
  createAssetFolder,
  createLibraryAsset,
  DEFAULT_ASSET_FOLDER,
  getLibraryAssetFolder,
  getLibraryAssetPath,
  listLibraryAssetFolders,
  listLibraryAssets,
  normalizeAssetFolderPath,
  replaceLibraryAsset,
} from '../../utils/asset-library.js';
import {testIsImageFile} from '../../utils/gcs.js';
import './AssetsPage.css';

type AssetFolderTreeNode = {
  type: 'folder';
  id: string;
  name: string;
  path: string;
  children: AssetTreeNode[];
};

type AssetFileTreeNode = {
  type: 'asset';
  id: string;
  name: string;
  path: string;
  asset: LibraryAsset;
  children: [];
};

type AssetTreeNode = AssetFolderTreeNode | AssetFileTreeNode;

export function AssetsPage() {
  usePageTitle('Assets');
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [folders, setFolders] = useState<LibraryAssetFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState(DEFAULT_ASSET_FOLDER);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [folderModalOpened, setFolderModalOpened] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAssetLibrary();
  }, []);

  const tree = useMemo(() => buildAssetTree(folders, assets), [folders, assets]);
  const selectedFolderNode = useMemo(
    () => findFolderNode(tree, selectedFolder),
    [selectedFolder, tree]
  );
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );
  const folderChildren = (selectedFolderNode?.children || []).filter(
    isFolderTreeNode
  );
  const folderAssets = (selectedFolderNode?.children || []).filter(
    isAssetTreeNode
  );

  async function loadAssetLibrary() {
    setLoading(true);
    try {
      const [nextAssets, nextFolders] = await Promise.all([
        listLibraryAssets(),
        listLibraryAssetFolders(),
      ]);
      setAssets(nextAssets);
      setFolders(nextFolders);
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Failed to load asset library',
        message: String(err),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }

  function selectFolder(folderPath: string) {
    setSelectedFolder(folderPath);
    setSelectedAssetId(null);
  }

  function selectAsset(asset: LibraryAsset) {
    setSelectedFolder(getLibraryAssetFolder(asset));
    setSelectedAssetId(asset.id);
  }

  async function handleCreateFolder(e: Event) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      return;
    }
    try {
      const folder = await createAssetFolder(`${selectedFolder}/${name}`);
      setNewFolderName('');
      setFolderModalOpened(false);
      await loadAssetLibrary();
      selectFolder(folder.path);
      showNotification({
        message: `Created folder ${folder.path}`,
        color: 'green',
      });
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Failed to create folder',
        message: String(err),
        color: 'red',
      });
    }
  }

  async function handleUpload(file?: File) {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const asset = await createLibraryAsset(file, {folder: selectedFolder});
      await loadAssetLibrary();
      selectAsset(asset);
      showNotification({
        message: 'Asset uploaded',
        color: 'green',
      });
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Asset upload failed',
        message: String(err),
        color: 'red',
      });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  }

  async function handleReplace(file?: File) {
    if (!file || !selectedAsset) {
      return;
    }
    setReplacing(true);
    try {
      await replaceLibraryAsset(selectedAsset.id, file);
      await loadAssetLibrary();
      setSelectedAssetId(selectedAsset.id);
      showNotification({
        message: 'Asset replaced',
        color: 'green',
      });
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Asset replace failed',
        message: String(err),
        color: 'red',
      });
    } finally {
      setReplacing(false);
      if (replaceInputRef.current) {
        replaceInputRef.current.value = '';
      }
    }
  }

  return (
    <Layout>
      <div className="AssetsPage" data-testid="assets-page">
        <input
          ref={uploadInputRef}
          className="AssetsPage__hiddenInput"
          type="file"
          onChange={(e) => handleUpload(e.currentTarget.files?.[0])}
        />
        <input
          ref={replaceInputRef}
          className="AssetsPage__hiddenInput"
          type="file"
          onChange={(e) => handleReplace(e.currentTarget.files?.[0])}
        />
        <Modal
          opened={folderModalOpened}
          onClose={() => setFolderModalOpened(false)}
          title="New folder"
          centered
        >
          <form onSubmit={handleCreateFolder}>
            <TextInput
              label="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.currentTarget.value)}
              placeholder="logos"
              data-autofocus
            />
            <Group position="right" spacing="xs" mt="md">
              <Button
                variant="default"
                onClick={() => setFolderModalOpened(false)}
              >
                Cancel
              </Button>
              <Button type="submit" leftIcon={<IconFolderPlus size={16} />}>
                Create
              </Button>
            </Group>
          </form>
        </Modal>

        <div className="AssetsPage__header">
          <div>
            <Heading size="h1">Assets</Heading>
            <Text as="p">
              Manage reusable files in the project's GCS-backed asset library.
            </Text>
          </div>
          <Group spacing="xs">
            <Button
              variant="default"
              leftIcon={<IconFolderPlus size={16} />}
              onClick={() => setFolderModalOpened(true)}
            >
              New folder
            </Button>
            <Button
              leftIcon={<IconUpload size={16} />}
              loading={uploading}
              onClick={() => uploadInputRef.current?.click()}
            >
              Upload asset
            </Button>
          </Group>
        </div>

        <div className="AssetsPage__layout">
          <Surface className="AssetsPage__treePanel">
            <div className="AssetsPage__panelHeader">
              <Text className="AssetsPage__panelTitle">Library</Text>
              <Tooltip label="Refresh assets" position="top" withArrow>
                <ActionIcon
                  variant="default"
                  onClick={loadAssetLibrary}
                  disabled={loading}
                  aria-label="Refresh assets"
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            </div>
            {loading ? (
              <div className="AssetsPage__loading">
                <Loader size="sm" />
              </div>
            ) : (
              <AssetTree
                nodes={tree.children}
                selectedFolder={selectedFolder}
                selectedAssetId={selectedAssetId}
                onSelectFolder={selectFolder}
                onSelectAsset={selectAsset}
              />
            )}
          </Surface>

          <Surface className="AssetsPage__browserPanel">
            <div className="AssetsPage__browserHeader">
              <div>
                <Text className="AssetsPage__crumb">/{selectedFolder}</Text>
                <Heading size="h2" as="h2">
                  {selectedFolder.split('/').pop()}
                </Heading>
              </div>
              <Button
                variant="default"
                leftIcon={<IconUpload size={16} />}
                loading={uploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                Upload here
              </Button>
            </div>
            {loading ? (
              <div className="AssetsPage__loading">
                <Loader size="sm" />
              </div>
            ) : folderChildren.length === 0 && folderAssets.length === 0 ? (
              <div className="AssetsPage__emptyFolder">
                <IconFolder size={24} />
                <Text>This folder is empty.</Text>
              </div>
            ) : (
              <div className="AssetsPage__fileGrid">
                {folderChildren.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className="AssetsPage__tile AssetsPage__tile--folder"
                    onClick={() => selectFolder(node.path)}
                  >
                    <IconFolder size={28} />
                    <span>{node.name}</span>
                  </button>
                ))}
                {folderAssets.map((node) => (
                  <AssetTile
                    key={node.id}
                    asset={node.asset}
                    selected={selectedAssetId === node.asset.id}
                    onClick={() => selectAsset(node.asset)}
                  />
                ))}
              </div>
            )}
          </Surface>

          <Surface className="AssetsPage__detailsPanel">
            {selectedAsset ? (
              <AssetDetails
                asset={selectedAsset}
                replacing={replacing}
                onReplace={() => replaceInputRef.current?.click()}
              />
            ) : (
              <div className="AssetsPage__detailsEmpty">
                <IconPhoto size={24} />
                <Text>Select an asset to view URLs and replacement options.</Text>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </Layout>
  );
}

function AssetTree(props: {
  nodes: AssetTreeNode[];
  selectedFolder: string;
  selectedAssetId: string | null;
  onSelectFolder: (path: string) => void;
  onSelectAsset: (asset: LibraryAsset) => void;
}) {
  if (props.nodes.length === 0) {
    return (
      <Text className="AssetsPage__treeEmpty">
        The asset library has no folders yet.
      </Text>
    );
  }
  return (
    <div className="AssetsPage__tree">
      {props.nodes.map((node) => (
        <AssetTreeRow
          key={node.id}
          node={node}
          level={0}
          selectedFolder={props.selectedFolder}
          selectedAssetId={props.selectedAssetId}
          onSelectFolder={props.onSelectFolder}
          onSelectAsset={props.onSelectAsset}
        />
      ))}
    </div>
  );
}

function AssetTreeRow(props: {
  node: AssetTreeNode;
  level: number;
  selectedFolder: string;
  selectedAssetId: string | null;
  onSelectFolder: (path: string) => void;
  onSelectAsset: (asset: LibraryAsset) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const node = props.node;
  const selected =
    node.type === 'folder'
      ? props.selectedFolder === node.path && !props.selectedAssetId
      : props.selectedAssetId === node.asset.id;
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <button
        type="button"
        className={`AssetsPage__treeRow ${
          selected ? 'AssetsPage__treeRow--selected' : ''
        }`}
        style={{paddingLeft: 8 + props.level * 14}}
        onClick={() => {
          if (node.type === 'folder') {
            props.onSelectFolder(node.path);
            if (hasChildren) {
              setExpanded((value) => !value);
            }
          } else {
            props.onSelectAsset(node.asset);
          }
        }}
      >
        {node.type === 'folder' ? (
          <span className="AssetsPage__treeToggle" aria-hidden="true">
            {hasChildren ? (
              expanded ? (
                <IconChevronDown size={14} />
              ) : (
                <IconChevronRight size={14} />
              )
            ) : (
              <span />
            )}
          </span>
        ) : (
          <span className="AssetsPage__treeToggle" />
        )}
        {node.type === 'folder' ? (
          <IconFolder size={16} />
        ) : testIsImageFile(node.asset.file.src) ? (
          <IconPhoto size={16} />
        ) : (
          <IconFile size={16} />
        )}
        <span>{node.name}</span>
      </button>
      {node.type === 'folder' &&
        expanded &&
        node.children.map((child) => (
          <AssetTreeRow
            key={child.id}
            node={child}
            level={props.level + 1}
            selectedFolder={props.selectedFolder}
            selectedAssetId={props.selectedAssetId}
            onSelectFolder={props.onSelectFolder}
            onSelectAsset={props.onSelectAsset}
          />
        ))}
    </div>
  );
}

function AssetTile(props: {
  asset: LibraryAsset;
  selected: boolean;
  onClick: () => void;
}) {
  const filename = props.asset.filename || props.asset.file.filename || props.asset.id;
  return (
    <button
      type="button"
      className={`AssetsPage__tile ${
        props.selected ? 'AssetsPage__tile--selected' : ''
      }`}
      onClick={props.onClick}
    >
      {testIsImageFile(props.asset.file.src) ? (
        <img src={props.asset.file.src} alt={props.asset.file.alt || ''} />
      ) : (
        <IconFile size={28} />
      )}
      <span>{filename}</span>
    </button>
  );
}

function AssetDetails(props: {
  asset: LibraryAsset;
  replacing: boolean;
  onReplace: () => void;
}) {
  const asset = props.asset;
  const gcsUrl = asset.file.gcsPath
    ? `https://storage.googleapis.com${asset.file.gcsPath}`
    : '';
  return (
    <div className="AssetsPage__details">
      <div className="AssetsPage__detailsPreview">
        {testIsImageFile(asset.file.src) ? (
          <img src={asset.file.src} alt={asset.file.alt || ''} />
        ) : (
          <IconFile size={36} />
        )}
      </div>
      <div>
        <Text className="AssetsPage__detailsName">
          {asset.filename || asset.file.filename || asset.id}
        </Text>
        <Text className="AssetsPage__detailsMeta">
          /{getLibraryAssetPath(asset)}
        </Text>
      </div>
      <div className="AssetsPage__urlGroup">
        {gcsUrl && <UrlRow label="GCS URL" url={gcsUrl} />}
        <UrlRow
          label={gcsUrl ? 'Google Image Service URL' : 'URL'}
          url={asset.file.src}
        />
      </div>
      <Button
        variant="default"
        leftIcon={<IconUpload size={16} />}
        loading={props.replacing}
        onClick={props.onReplace}
      >
        Replace asset
      </Button>
    </div>
  );
}

function UrlRow(props: {label?: string; url: string}) {
  return (
    <div className="AssetsPage__urlRow">
      {props.label && (
        <div className="AssetsPage__urlRow__label">{props.label}</div>
      )}
      <div className="AssetsPage__urlRow__input">
        <Textarea
          readOnly
          value={props.url}
          autosize
          minRows={1}
          size="xs"
          radius="xs"
          onClick={(e: Event) => (e.target as HTMLTextAreaElement).select()}
          styles={{root: {flex: 1, minWidth: 0}}}
        />
        <CopyButton url={props.url} />
      </div>
    </div>
  );
}

function CopyButton(props: {url: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip label={copied ? 'Copied!' : 'Copy URL'} position="top" withArrow>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={() => {
          navigator.clipboard.writeText(props.url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        <IconCopy size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

function buildAssetTree(
  folders: LibraryAssetFolder[],
  assets: LibraryAsset[]
): AssetFolderTreeNode {
  const root: AssetFolderTreeNode = {
    type: 'folder',
    id: 'folder:',
    name: 'Assets',
    path: '',
    children: [],
  };
  const folderNodes = new Map<string, AssetFolderTreeNode>();
  folderNodes.set('', root);

  const ensureFolder = (folderPath: string) => {
    const path = normalizeAssetFolderPath(folderPath);
    const segments = path.split('/');
    let currentPath = '';
    let parent = root;
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let node = folderNodes.get(currentPath);
      if (!node) {
        node = {
          type: 'folder',
          id: `folder:${currentPath}`,
          name: segment,
          path: currentPath,
          children: [],
        };
        folderNodes.set(currentPath, node);
        parent.children.push(node);
      }
      parent = node;
    }
    return parent;
  };

  ensureFolder(DEFAULT_ASSET_FOLDER);
  folders.forEach((folder) => ensureFolder(folder.path));
  assets.forEach((asset) => {
    const folder = ensureFolder(getLibraryAssetFolder(asset));
    const name = asset.filename || asset.file.filename || asset.id;
    folder.children.push({
      type: 'asset',
      id: `asset:${asset.id}`,
      name,
      path: getLibraryAssetPath(asset),
      asset,
      children: [],
    });
  });
  sortTree(root);
  return root;
}

function sortTree(node: AssetTreeNode) {
  node.children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

function findFolderNode(
  node: AssetTreeNode,
  folderPath: string
): AssetFolderTreeNode | null {
  if (node.type === 'folder' && node.path === folderPath) {
    return node;
  }
  for (const child of node.children) {
    const result = findFolderNode(child, folderPath);
    if (result) {
      return result;
    }
  }
  return null;
}

function isFolderTreeNode(node: AssetTreeNode): node is AssetFolderTreeNode {
  return node.type === 'folder';
}

function isAssetTreeNode(node: AssetTreeNode): node is AssetFileTreeNode {
  return node.type === 'asset';
}
