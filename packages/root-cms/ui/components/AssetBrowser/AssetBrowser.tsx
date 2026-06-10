import './AssetBrowser.css';

import {
  ActionIcon,
  Button,
  Loader,
  Menu,
  Modal,
  Table,
  TextInput,
} from '@mantine/core';
import {
  hideNotification,
  showNotification,
  updateNotification,
} from '@mantine/notifications';
import {
  IconArrowRight,
  IconChevronRight,
  IconCopy,
  IconDotsVertical,
  IconDownload,
  IconFolder,
  IconFolderPlus,
  IconFolderSymlink,
  IconInfoCircle,
  IconPencil,
  IconSearch,
  IconTrash,
  IconUpload,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {
  Asset,
  AssetFile,
  AssetFolder,
  createAssetFile,
  createAssetFolder,
  deleteAsset,
  findDocsUsingAsset,
  getAsset,
  getRelativeFolderPath,
  joinFolderPath,
  listAssets,
  listAssetsRecursive,
  moveAsset,
  parseFolderPath,
  renameAsset,
} from '../../utils/assets.js';
import {joinClassNames} from '../../utils/classes.js';
import {testFileMatchesAccept, uploadFileToGCS} from '../../utils/gcs.js';
import {notifyErrors} from '../../utils/notifications.js';
import {testCanPublish} from '../../utils/permissions.js';
import {getTimeAgo} from '../../utils/time.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import {AssetDetailsModal} from './AssetDetailsModal.js';
import {
  AssetThumbnail,
  copyAssetUrl,
  downloadAssetFile,
} from './AssetPreview.js';

export type AssetBrowserMode = 'manage' | 'pick';

export interface AssetBrowserProps {
  className?: string;
  /**
   * `manage` shows the full management UI (used by the assets page); `pick`
   * is a simplified browser for selecting a file (used by the asset picker
   * modal in image/file fields).
   */
  mode: AssetBrowserMode;
  /** Current folder path. When provided, the folder state is controlled. */
  folder?: string;
  /** Called when the user navigates to a folder. */
  onFolderChange?: (folder: string) => void;
  /** Pick mode: called when the user selects a file. */
  onPickFile?: (asset: AssetFile) => void;
  /** Pick mode: accept list used to filter pickable files, e.g. `['image/png']`. */
  accept?: string[];
  /** Manage mode: opens the details modal for an asset id on load (deep link). */
  initialAssetId?: string;
}

/**
 * A Drive-like file browser for the project's asset manager. Lists the
 * contents of a folder with breadcrumb navigation and supports uploading,
 * organizing (folders, rename, move, delete) and inspecting assets.
 */
export function AssetBrowser(props: AssetBrowserProps) {
  const [internalFolder, setInternalFolder] = useState(props.folder || '');
  const folder = props.folder ?? internalFolder;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Recursive listing of the current folder's descendants, lazily fetched the
  // first time the user types a name filter (then filtered client-side).
  const [searchIndex, setSearchIndex] = useState<Asset[] | null>(null);

  const [newFolderModalOpened, setNewFolderModalOpened] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Asset | null>(null);
  const [moveTarget, setMoveTarget] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<AssetFile | null>(null);

  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  // Writes to the Assets db collection require publish-level permissions.
  const canManage = testCanPublish(roles, currentUserEmail);

  const searching = filter.trim().length > 0;

  function setFolder(newFolder: string) {
    setInternalFolder(newFolder);
    setFilter('');
    if (props.onFolderChange) {
      props.onFolderChange(newFolder);
    }
  }

  async function reload(folderPath: string) {
    setLoading(true);
    // Invalidate the search index so an active search refetches fresh data.
    setSearchIndex(null);
    await notifyErrors(async () => {
      const res = await listAssets(folderPath);
      setAssets(res);
    });
    setLoading(false);
  }

  useEffect(() => {
    reload(folder);
  }, [folder]);

  // Fetches the recursive descendants listing when a name search starts. The
  // result is cached until the folder changes or the listing is reloaded;
  // subsequent keystrokes filter client-side.
  useEffect(() => {
    if (!searching || searchIndex !== null) {
      return;
    }
    let cancelled = false;
    notifyErrors(async () => {
      const res = await listAssetsRecursive(folder);
      if (!cancelled) {
        setSearchIndex(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searching, searchIndex, folder]);

  // Deep link: open the details modal for ?asset=<id>.
  const initialAssetId = props.mode === 'manage' ? props.initialAssetId : '';
  useEffect(() => {
    if (!initialAssetId) {
      return;
    }
    notifyErrors(async () => {
      const asset = await getAsset(initialAssetId);
      if (asset && asset.type === 'file') {
        setFolder(asset.parent);
        setDetailsTarget(asset);
      }
    });
  }, [initialAssetId]);

  const filteredAssets = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    // Name searches match recursively across the folder's subfolders.
    let res = needle ? searchIndex || [] : assets;
    if (props.mode === 'pick') {
      res = res.filter(
        (asset) =>
          asset.type === 'folder' ||
          testFileMatchesAccept(
            asset.file?.filename || asset.name,
            props.accept
          )
      );
    }
    if (needle) {
      res = res.filter((asset) => asset.name.toLowerCase().includes(needle));
    }
    return res;
  }, [assets, searchIndex, filter, props.mode, props.accept]);

  async function uploadFiles(files: File[]) {
    if (files.length === 0 || uploading) {
      return;
    }
    const notificationId = 'asset-browser-upload';
    setUploading(true);
    showNotification({
      id: notificationId,
      message: `Uploading ${files.length} file(s)...`,
      loading: true,
      autoClose: false,
      disallowClose: true,
    });
    const uploaded: AssetFile[] = [];
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      updateNotification({
        id: notificationId,
        message: `Uploading ${file.name} (${i + 1} of ${files.length})...`,
        loading: true,
        autoClose: false,
        disallowClose: true,
      });
      try {
        const uploadedFile = await uploadFileToGCS(file);
        const asset = await createAssetFile({
          parent: folder,
          file: uploadedFile,
        });
        uploaded.push(asset);
      } catch (err) {
        console.error(`failed to upload ${file.name}:`, err);
        failed.push(file.name);
      }
    }
    hideNotification(notificationId);
    setUploading(false);
    if (failed.length > 0) {
      showNotification({
        title: 'Upload failed',
        message: `Failed to upload: ${failed.join(', ')}`,
        color: 'red',
        autoClose: false,
      });
    } else {
      showNotification({
        message: `Uploaded ${uploaded.length} file(s).`,
        color: 'green',
      });
    }
    await reload(folder);
    // In pick mode, uploading a single file selects it immediately.
    if (
      props.mode === 'pick' &&
      uploaded.length === 1 &&
      files.length === 1 &&
      props.onPickFile
    ) {
      props.onPickFile(uploaded[0]);
    }
  }

  function requestUpload() {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.multiple = true;
    if (props.mode === 'pick' && props.accept && props.accept.length > 0) {
      inputEl.accept = props.accept.join(',');
    }
    inputEl.onchange = () => {
      uploadFiles(Array.from(inputEl.files || []));
    };
    inputEl.click();
    inputEl.remove();
  }

  function onPickFile(asset: AssetFile) {
    if (props.onPickFile) {
      props.onPickFile(asset);
    }
  }

  const showUpload = canManage;

  return (
    <div
      className={joinClassNames(
        'AssetBrowser',
        props.className,
        `AssetBrowser--${props.mode}`
      )}
    >
      <div className="AssetBrowser__toolbar">
        <AssetBrowser.Breadcrumbs folder={folder} onNavigate={setFolder} />
        <div className="AssetBrowser__toolbar__actions">
          <TextInput
            className="AssetBrowser__toolbar__filter"
            placeholder="Search by name"
            size="xs"
            icon={<IconSearch size={14} />}
            value={filter}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFilter(e.currentTarget.value)
            }
          />
          {showUpload && props.mode === 'manage' && (
            <Button
              variant="default"
              size="xs"
              leftIcon={<IconFolderPlus size={16} />}
              onClick={() => setNewFolderModalOpened(true)}
            >
              New folder
            </Button>
          )}
          {showUpload && (
            <Button
              color="dark"
              size="xs"
              leftIcon={<IconUpload size={16} />}
              loading={uploading}
              onClick={() => requestUpload()}
            >
              Upload
            </Button>
          )}
        </div>
      </div>
      <div
        className={joinClassNames(
          'AssetBrowser__listing',
          dragging && 'dragging'
        )}
        onDragOver={(e) => {
          if (!showUpload) {
            return;
          }
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!showUpload) {
            return;
          }
          uploadFiles(Array.from(e.dataTransfer?.files || []));
        }}
      >
        {loading || (searching && searchIndex === null) ? (
          <div className="AssetBrowser__loading">
            <Loader color="gray" size="lg" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div
            className="AssetBrowser__empty"
            data-testid="asset-browser-empty"
          >
            {filter ? (
              <div>
                No assets match "{filter}" in this folder or its subfolders.
              </div>
            ) : (
              <>
                <div>This folder is empty.</div>
                {showUpload && (
                  <div className="AssetBrowser__empty__hint">
                    Drop files here or click "Upload" to add assets.
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <Table
            className="AssetBrowser__table"
            verticalSpacing="xs"
            fontSize="xs"
            highlightOnHover
          >
            <thead>
              <tr>
                <th>name</th>
                <th className="AssetBrowser__table__modifiedCol">modified</th>
                <th className="AssetBrowser__table__actionsCol"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) =>
                asset.type === 'folder' ? (
                  <tr
                    key={asset.id}
                    className="AssetBrowser__row AssetBrowser__row--folder"
                    onClick={() =>
                      setFolder(joinFolderPath(asset.parent, asset.name))
                    }
                  >
                    <td>
                      <div className="AssetBrowser__nameCell">
                        <div className="AssetBrowser__thumb">
                          <IconFolder size={24} stroke="1.5" />
                        </div>
                        <div className="AssetBrowser__nameCell__text">
                          <div className="AssetBrowser__nameCell__name">
                            {asset.name}
                          </div>
                          <AssetLocation
                            asset={asset}
                            folder={folder}
                            searching={searching}
                            onNavigate={setFolder}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <AssetModifiedBy asset={asset} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="AssetBrowser__actionsCell">
                        {props.mode === 'manage' && canManage && (
                          <Menu
                            shadow="sm"
                            position="bottom"
                            placement="end"
                            control={
                              <ActionIcon size="sm">
                                <IconDotsVertical size={16} />
                              </ActionIcon>
                            }
                          >
                            <Menu.Item
                              icon={<IconPencil size={14} />}
                              onClick={() => setRenameTarget(asset)}
                            >
                              Rename
                            </Menu.Item>
                            <Menu.Item
                              icon={<IconFolderSymlink size={14} />}
                              onClick={() => setMoveTarget(asset)}
                            >
                              Move
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              icon={<IconTrash size={14} />}
                              onClick={() => setDeleteTarget(asset)}
                            >
                              Delete
                            </Menu.Item>
                          </Menu>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={asset.id}
                    className="AssetBrowser__row AssetBrowser__row--file"
                    onClick={() => {
                      if (props.mode === 'pick') {
                        onPickFile(asset);
                      } else {
                        setDetailsTarget(asset);
                      }
                    }}
                  >
                    <td>
                      <div className="AssetBrowser__nameCell">
                        <AssetThumbnail file={asset.file} size={36} />
                        <div className="AssetBrowser__nameCell__text">
                          <div className="AssetBrowser__nameCell__name">
                            {asset.name}
                            {Boolean(
                              asset.file?.width && asset.file?.height
                            ) && (
                              <span className="AssetBrowser__nameCell__dimens">
                                {' '}
                                ({asset.file.width}x{asset.file.height})
                              </span>
                            )}
                          </div>
                          <AssetLocation
                            asset={asset}
                            folder={folder}
                            searching={searching}
                            onNavigate={setFolder}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <AssetModifiedBy asset={asset} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="AssetBrowser__actionsCell">
                        {props.mode === 'pick' ? (
                          <Button
                            variant="filled"
                            color="dark"
                            size="xs"
                            compact
                            onClick={() => onPickFile(asset)}
                            rightIcon={<IconArrowRight size={14} />}
                          >
                            Select
                          </Button>
                        ) : (
                          <FileActionsMenu
                            asset={asset}
                            canManage={canManage}
                            onDetails={() => setDetailsTarget(asset)}
                            onRename={() => setRenameTarget(asset)}
                            onMove={() => setMoveTarget(asset)}
                            onDelete={() => setDeleteTarget(asset)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </Table>
        )}
      </div>

      <NewFolderModal
        opened={newFolderModalOpened}
        parent={folder}
        onClose={() => setNewFolderModalOpened(false)}
        onCreated={(folderName) => {
          setNewFolderModalOpened(false);
          setFolder(joinFolderPath(folder, folderName));
        }}
      />
      {renameTarget && (
        <RenameAssetModal
          asset={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={() => {
            setRenameTarget(null);
            reload(folder);
          }}
        />
      )}
      {moveTarget && (
        <MoveAssetModal
          asset={moveTarget}
          onClose={() => setMoveTarget(null)}
          onMoved={() => {
            setMoveTarget(null);
            reload(folder);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteAssetModal
          asset={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            reload(folder);
          }}
        />
      )}
      {detailsTarget && (
        <AssetDetailsModal
          asset={detailsTarget}
          canManage={canManage}
          onClose={() => setDetailsTarget(null)}
          onChanged={() => reload(folder)}
          onDeleted={() => {
            setDetailsTarget(null);
            reload(folder);
          }}
        />
      )}
    </div>
  );
}

AssetBrowser.Breadcrumbs = (props: {
  folder: string;
  onNavigate: (folder: string) => void;
}) => {
  const segments = parseFolderPath(props.folder);
  const crumbs: Array<{label: string; path: string}> = [
    {label: 'Assets', path: ''},
  ];
  segments.forEach((segment, i) => {
    crumbs.push({
      label: segment,
      path: segments.slice(0, i + 1).join('/'),
    });
  });
  return (
    <div className="AssetBrowser__breadcrumbs">
      {crumbs.map((crumb, i) => (
        <div key={crumb.path} className="AssetBrowser__breadcrumbs__crumb">
          {i > 0 && (
            <IconChevronRight
              className="AssetBrowser__breadcrumbs__divider"
              size={14}
            />
          )}
          <button
            className={joinClassNames(
              'AssetBrowser__breadcrumbs__link',
              i === crumbs.length - 1 && 'active'
            )}
            disabled={i === crumbs.length - 1}
            onClick={() => props.onNavigate(crumb.path)}
          >
            {crumb.label}
          </button>
        </div>
      ))}
    </div>
  );
};

function FileActionsMenu(props: {
  asset: AssetFile;
  canManage: boolean;
  onDetails: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const asset = props.asset;
  return (
    <Menu
      shadow="sm"
      position="bottom"
      placement="end"
      control={
        <ActionIcon size="sm">
          <IconDotsVertical size={16} />
        </ActionIcon>
      }
    >
      <Menu.Item icon={<IconInfoCircle size={14} />} onClick={props.onDetails}>
        Details
      </Menu.Item>
      <Menu.Item
        icon={<IconCopy size={14} />}
        onClick={() => copyAssetUrl(asset.file)}
      >
        Copy URL
      </Menu.Item>
      <Menu.Item
        icon={<IconDownload size={14} />}
        onClick={() => downloadAssetFile(asset.file)}
      >
        Download
      </Menu.Item>
      {props.canManage && (
        <>
          <Menu.Item icon={<IconPencil size={14} />} onClick={props.onRename}>
            Rename
          </Menu.Item>
          <Menu.Item
            icon={<IconFolderSymlink size={14} />}
            onClick={props.onMove}
          >
            Move
          </Menu.Item>
          <Menu.Item
            color="red"
            icon={<IconTrash size={14} />}
            onClick={props.onDelete}
          >
            Delete
          </Menu.Item>
        </>
      )}
    </Menu>
  );
}

/**
 * During a recursive name search, shows the subfolder an asset lives in
 * (relative to the folder being searched). Clicking it navigates to that
 * folder.
 */
function AssetLocation(props: {
  asset: Asset;
  folder: string;
  searching: boolean;
  onNavigate: (folder: string) => void;
}) {
  const asset = props.asset;
  if (!props.searching || asset.parent === props.folder) {
    return null;
  }
  return (
    <button
      className="AssetBrowser__nameCell__path"
      title="Go to folder"
      onClick={(e) => {
        e.stopPropagation();
        props.onNavigate(asset.parent);
      }}
    >
      in {getRelativeFolderPath(asset.parent, props.folder)}
    </button>
  );
}

/**
 * Renders who last modified an asset (avatar with name/email tooltip) along
 * with a relative timestamp.
 */
function AssetModifiedBy(props: {asset: Asset}) {
  const ts = props.asset.modifiedAt || props.asset.createdAt;
  const by = props.asset.modifiedBy || props.asset.createdBy || '';
  const millis = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
  return (
    <div className="AssetBrowser__modifiedCell">
      {by && <UserAvatar email={by} size={20} />}
      <span>{millis ? getTimeAgo(millis) : '—'}</span>
    </div>
  );
}

function NewFolderModal(props: {
  opened: boolean;
  parent: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    await notifyErrors(async () => {
      const folder = await createAssetFolder(props.parent, name);
      setName('');
      props.onCreated(folder.name);
    });
    setLoading(false);
  }

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="New folder"
      size="sm"
      centered
    >
      <form
        className="AssetBrowser__modalForm"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <TextInput
          data-autofocus
          placeholder="Folder name"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setName(e.currentTarget.value)
          }
        />
        <Button type="submit" color="dark" loading={loading} disabled={!name}>
          Create
        </Button>
      </form>
    </Modal>
  );
}

function RenameAssetModal(props: {
  asset: Asset;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(props.asset.name);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    await notifyErrors(async () => {
      await renameAsset(props.asset, name);
      props.onRenamed();
    });
    setLoading(false);
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={`Rename ${props.asset.type}`}
      size="sm"
      centered
    >
      <form
        className="AssetBrowser__modalForm"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <TextInput
          data-autofocus
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setName(e.currentTarget.value)
          }
        />
        <Button type="submit" color="dark" loading={loading} disabled={!name}>
          Rename
        </Button>
      </form>
    </Modal>
  );
}

function MoveAssetModal(props: {
  asset: Asset;
  onClose: () => void;
  onMoved: () => void;
}) {
  const asset = props.asset;
  const [path, setPath] = useState(asset.parent);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    setLoading(true);
    notifyErrors(async () => {
      const res = await listAssets(path);
      setFolders(res.filter((a) => a.type === 'folder') as AssetFolder[]);
    }).then(() => setLoading(false));
  }, [path]);

  const assetPath =
    asset.type === 'folder' ? joinFolderPath(asset.parent, asset.name) : '';

  function isDisabledFolder(folderPath: string) {
    // A folder cannot be moved into itself or its own subtree.
    if (asset.type !== 'folder') {
      return false;
    }
    return folderPath === assetPath || folderPath.startsWith(`${assetPath}/`);
  }

  async function onMove() {
    setMoving(true);
    await notifyErrors(async () => {
      await moveAsset(asset, path);
      showNotification({
        message: `Moved "${asset.name}" to ${path || 'Assets'}.`,
        color: 'green',
      });
      props.onMoved();
    });
    setMoving(false);
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={`Move "${asset.name}"`}
      size="md"
      centered
    >
      <div className="AssetBrowser__moveModal">
        <AssetBrowser.Breadcrumbs folder={path} onNavigate={setPath} />
        <div className="AssetBrowser__moveModal__folders">
          {loading ? (
            <Loader color="gray" size="sm" />
          ) : folders.length === 0 ? (
            <div className="AssetBrowser__moveModal__empty">No subfolders.</div>
          ) : (
            folders.map((folderAsset) => {
              const folderPath = joinFolderPath(
                folderAsset.parent,
                folderAsset.name
              );
              return (
                <button
                  key={folderAsset.id}
                  className="AssetBrowser__moveModal__folder"
                  disabled={isDisabledFolder(folderPath)}
                  onClick={() => setPath(folderPath)}
                >
                  <IconFolder size={16} stroke="1.5" />
                  <span>{folderAsset.name}</span>
                  <IconChevronRight size={14} />
                </button>
              );
            })
          )}
        </div>
        <Button
          color="dark"
          fullWidth
          loading={moving}
          disabled={path === asset.parent}
          onClick={() => onMove()}
        >
          Move here
        </Button>
      </div>
    </Modal>
  );
}

function DeleteAssetModal(props: {
  asset: Asset;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const asset = props.asset;
  const [loading, setLoading] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);

  useEffect(() => {
    if (asset.type !== 'file') {
      return;
    }
    findDocsUsingAsset(asset.id)
      .then((docs) => setUsageCount(docs.length))
      .catch(() => setUsageCount(null));
  }, [asset.id]);

  async function onDelete() {
    setLoading(true);
    await notifyErrors(async () => {
      await deleteAsset(asset);
      showNotification({message: `Deleted "${asset.name}".`, color: 'green'});
      props.onDeleted();
    });
    setLoading(false);
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={`Delete ${asset.type}?`}
      size="sm"
      centered
    >
      <div className="AssetBrowser__deleteModal">
        <div className="AssetBrowser__deleteModal__text">
          Are you sure you want to delete <b>{asset.name}</b> from the asset
          manager?
          {asset.type === 'file' && (
            <>
              {' '}
              The underlying file is not deleted from GCS, and docs that
              currently use the asset keep their copy of the file.
            </>
          )}
        </div>
        {asset.type === 'file' && usageCount !== null && usageCount > 0 && (
          <div className="AssetBrowser__deleteModal__warning">
            This asset is currently used in {usageCount} doc(s). Those docs will
            no longer receive updates when the asset changes.
          </div>
        )}
        <div className="AssetBrowser__deleteModal__buttons">
          <Button variant="default" onClick={props.onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="red" loading={loading} onClick={() => onDelete()}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
