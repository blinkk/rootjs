import './AssetBrowser.css';

import {
  ActionIcon,
  Button,
  Checkbox,
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
import {usePagination} from '../../hooks/usePagination.js';
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
  syncAssetToDocs,
  updateAssetAltDisabled,
} from '../../utils/assets.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  testFileMatchesAccept,
  testIsImageFile,
  testIsVideoFile,
  uploadFileToGCS,
} from '../../utils/gcs.js';
import {notifyErrors} from '../../utils/notifications.js';
import {testCanPublish} from '../../utils/permissions.js';
import {getTimeAgo} from '../../utils/time.js';
import {Pagination, PaginationSummary} from '../Pagination/Pagination.js';
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
  /**
   * Initial folder path when uncontrolled. Ignored if `folder` is provided.
   */
  initialFolder?: string;
  /** Called when the user navigates to a folder. */
  onFolderChange?: (folder: string) => void;
  /** Pick mode: called when the user selects a file. */
  onPickFile?: (asset: AssetFile) => void;
  /** Pick mode: accept list used to filter pickable files, e.g. `['image/png']`. */
  accept?: string[];
  /** Manage mode: opens the details modal for an asset id on load (deep link). */
  initialAssetId?: string;
}

/** Number of assets to display per page. */
const PAGE_SIZE = 100;

/**
 * A Drive-like file browser for the project's asset library. Lists the
 * contents of a folder with breadcrumb navigation and supports uploading,
 * organizing (folders, rename, move, delete) and inspecting assets.
 */
export function AssetBrowser(props: AssetBrowserProps) {
  const [internalFolder, setInternalFolder] = useState(
    props.folder ?? props.initialFolder ?? ''
  );
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
  const [moveTarget, setMoveTarget] = useState<Asset[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset[] | null>(null);
  const [disableAltTarget, setDisableAltTarget] = useState<AssetFile[] | null>(
    null
  );
  const [detailsTarget, setDetailsTarget] = useState<AssetFile | null>(null);
  // Multi-select for bulk actions (manage mode), keyed by asset id.
  const [selected, setSelected] = useState<Map<string, Asset>>(new Map());

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
    setSelected(new Map());
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
    (async () => {
      let res: Asset[] = [];
      await notifyErrors(async () => {
        res = await listAssetsRecursive(folder);
      });
      if (!cancelled) {
        setSearchIndex(res);
      }
    })();
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

  // Paginate the listing, resetting to the first page when the folder or the
  // search filter changes.
  const pagination = usePagination(filteredAssets, {
    pageSize: PAGE_SIZE,
    resetDeps: [folder, filter],
  });
  const pageItems = pagination.pageItems;

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

  // Multi-select for bulk actions (move, delete, disable alt text).
  const showSelection = props.mode === 'manage' && canManage;
  const selectedAssets = Array.from(selected.values());
  // Alt text only applies to file assets that render as images/videos.
  const selectedAltFiles = selectedAssets.filter(
    (asset): asset is AssetFile =>
      asset.type === 'file' &&
      !asset.file?.altDisabled &&
      (testIsImageFile(asset.file?.filename || asset.name) ||
        testIsVideoFile(asset.file?.filename || asset.name))
  );
  // Select-all applies to the assets visible on the current page; selections
  // made on other pages are preserved.
  const allSelected =
    pageItems.length > 0 && pageItems.every((asset) => selected.has(asset.id));

  function toggleSelected(asset: Asset) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.set(asset.id, asset);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        pageItems.forEach((asset) => next.delete(asset.id));
      } else {
        pageItems.forEach((asset) => next.set(asset.id, asset));
      }
      return next;
    });
  }

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
      {showSelection && selectedAssets.length > 0 && (
        <div className="AssetBrowser__selectionBar">
          <div className="AssetBrowser__selectionBar__count">
            {selectedAssets.length} selected
          </div>
          <div className="AssetBrowser__selectionBar__actions">
            <Button
              variant="default"
              size="xs"
              leftIcon={<IconFolderSymlink size={14} />}
              onClick={() => setMoveTarget(selectedAssets)}
            >
              Move
            </Button>
            {selectedAltFiles.length > 0 && (
              <Button
                variant="default"
                size="xs"
                onClick={() => setDisableAltTarget(selectedAltFiles)}
              >
                Disable alt text
              </Button>
            )}
            <Button
              color="red"
              size="xs"
              leftIcon={<IconTrash size={14} />}
              onClick={() => setDeleteTarget(selectedAssets)}
            >
              Delete
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setSelected(new Map())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
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
                {showSelection && (
                  <th className="AssetBrowser__table__checkboxCol">
                    <Checkbox
                      size="xs"
                      aria-label="Select all"
                      checked={allSelected}
                      indeterminate={
                        !allSelected &&
                        pageItems.some((asset) => selected.has(asset.id))
                      }
                      onChange={() => toggleSelectAll()}
                    />
                  </th>
                )}
                <th>name</th>
                <th className="AssetBrowser__table__modifiedCol">modified</th>
                <th className="AssetBrowser__table__actionsCol"></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((asset) =>
                asset.type === 'folder' ? (
                  <tr
                    key={asset.id}
                    className="AssetBrowser__row AssetBrowser__row--folder"
                    onClick={() =>
                      setFolder(joinFolderPath(asset.parent, asset.name))
                    }
                  >
                    {showSelection && (
                      <td
                        className="AssetBrowser__checkboxCell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          size="xs"
                          aria-label={`Select ${asset.name}`}
                          checked={selected.has(asset.id)}
                          onChange={() => toggleSelected(asset)}
                        />
                      </td>
                    )}
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
                              onClick={() => setMoveTarget([asset])}
                            >
                              Move
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              icon={<IconTrash size={14} />}
                              onClick={() => setDeleteTarget([asset])}
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
                    {showSelection && (
                      <td
                        className="AssetBrowser__checkboxCell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          size="xs"
                          aria-label={`Select ${asset.name}`}
                          checked={selected.has(asset.id)}
                          onChange={() => toggleSelected(asset)}
                        />
                      </td>
                    )}
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
                        {props.mode !== 'pick' && (
                          <FileActionsMenu
                            asset={asset}
                            canManage={canManage}
                            onDetails={() => setDetailsTarget(asset)}
                            onRename={() => setRenameTarget(asset)}
                            onMove={() => setMoveTarget([asset])}
                            onDelete={() => setDeleteTarget([asset])}
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

      {pagination.totalPages > 1 && (
        <div className="AssetBrowser__footer">
          <PaginationSummary
            start={pagination.start}
            end={pagination.end}
            total={pagination.totalItems}
            noun="asset"
          />
          <Pagination
            total={pagination.totalPages}
            page={pagination.page}
            onChange={pagination.setPage}
          />
        </div>
      )}

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
      {moveTarget && moveTarget.length > 0 && (
        <MoveAssetModal
          assets={moveTarget}
          onClose={() => setMoveTarget(null)}
          onMoved={() => {
            setMoveTarget(null);
            reload(folder);
          }}
        />
      )}
      {deleteTarget && deleteTarget.length > 0 && (
        <DeleteAssetModal
          assets={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            reload(folder);
          }}
        />
      )}
      {disableAltTarget && disableAltTarget.length > 0 && (
        <DisableAltTextModal
          assets={disableAltTarget}
          onClose={() => setDisableAltTarget(null)}
          onDone={() => {
            setDisableAltTarget(null);
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
  assets: Asset[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const assets = props.assets;
  const [path, setPath] = useState(assets[0]?.parent || '');
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

  const folderAssetPaths = assets
    .filter((asset) => asset.type === 'folder')
    .map((asset) => joinFolderPath(asset.parent, asset.name));

  function isDisabledFolder(folderPath: string) {
    // A folder cannot be moved into itself or its own subtree.
    return folderAssetPaths.some(
      (assetPath) =>
        folderPath === assetPath || folderPath.startsWith(`${assetPath}/`)
    );
  }

  async function onMove() {
    setMoving(true);
    const failed: string[] = [];
    let numMoved = 0;
    for (const asset of assets) {
      try {
        await moveAsset(asset, path);
        numMoved += 1;
      } catch (err) {
        console.error(`failed to move ${asset.name}:`, err);
        failed.push(asset.name);
      }
    }
    setMoving(false);
    if (failed.length > 0) {
      showNotification({
        title: 'Move failed',
        message: `Failed to move: ${failed.join(', ')}`,
        color: 'red',
        autoClose: false,
      });
    }
    if (numMoved > 0) {
      showNotification({
        message:
          assets.length === 1
            ? `Moved "${assets[0].name}" to ${path || 'Assets'}.`
            : `Moved ${numMoved} item(s) to ${path || 'Assets'}.`,
        color: 'green',
      });
    }
    props.onMoved();
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={
        assets.length === 1
          ? `Move "${assets[0].name}"`
          : `Move ${assets.length} items`
      }
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
          disabled={assets.every((asset) => asset.parent === path)}
          onClick={() => onMove()}
        >
          Move here
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Max files for which doc usage is looked up before deleting. Usage requires
 * a query per file per collection, so very large selections skip the check.
 */
const MAX_USAGE_LOOKUPS = 20;

function DeleteAssetModal(props: {
  assets: Asset[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const assets = props.assets;
  const [loading, setLoading] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);

  const files = assets.filter((asset) => asset.type === 'file');
  const hasFolders = assets.some((asset) => asset.type === 'folder');

  useEffect(() => {
    if (files.length === 0 || files.length > MAX_USAGE_LOOKUPS) {
      return;
    }
    Promise.all(files.map((asset) => findDocsUsingAsset(asset.id)))
      .then((results) => {
        const docIds = new Set(results.flat().map((cmsDoc) => cmsDoc.id));
        setUsageCount(docIds.size);
      })
      .catch(() => setUsageCount(null));
  }, [assets.map((asset) => asset.id).join(',')]);

  async function onDelete() {
    setLoading(true);
    const failed: string[] = [];
    let numDeleted = 0;
    for (const asset of assets) {
      try {
        await deleteAsset(asset);
        numDeleted += 1;
      } catch (err) {
        console.error(`failed to delete ${asset.name}:`, err);
        failed.push(asset.name);
      }
    }
    setLoading(false);
    if (failed.length > 0) {
      showNotification({
        title: 'Delete failed',
        message: `Failed to delete: ${failed.join(', ')}. Note that folders must be empty before they can be deleted.`,
        color: 'red',
        autoClose: false,
      });
    }
    if (numDeleted > 0) {
      showNotification({
        message:
          assets.length === 1
            ? `Deleted "${assets[0].name}".`
            : `Deleted ${numDeleted} item(s).`,
        color: 'green',
      });
    }
    props.onDeleted();
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={
        assets.length === 1
          ? `Delete ${assets[0].type}?`
          : `Delete ${assets.length} items?`
      }
      size="sm"
      centered
    >
      <div className="AssetBrowser__deleteModal">
        <div className="AssetBrowser__deleteModal__text">
          Are you sure you want to delete{' '}
          {assets.length === 1 ? (
            <b>{assets[0].name}</b>
          ) : (
            <b>{assets.length} items</b>
          )}{' '}
          from the asset manager?
          {files.length > 0 && (
            <>
              {' '}
              The underlying files are not deleted from GCS, and docs that
              currently use the assets keep their copy of the files.
            </>
          )}
          {hasFolders && (
            <> Folders must be empty before they can be deleted.</>
          )}
        </div>
        {usageCount !== null && usageCount > 0 && (
          <div className="AssetBrowser__deleteModal__warning">
            {assets.length === 1 ? 'This asset is' : 'These assets are'}{' '}
            currently used in {usageCount} doc(s). Those docs will no longer
            receive updates when the asset changes.
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

/**
 * Confirmation modal for bulk-disabling alt text handling on file assets
 * (e.g. decorative images). Each updated asset is synced to the draft docs
 * that use it so their embedded alt text is cleared.
 */
function DisableAltTextModal(props: {
  assets: AssetFile[];
  onClose: () => void;
  onDone: () => void;
}) {
  const assets = props.assets;
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    setLoading(true);
    const failed: string[] = [];
    let numUpdated = 0;
    for (const asset of assets) {
      try {
        const previousFile = asset.file;
        const updated = await updateAssetAltDisabled(asset, true);
        await syncAssetToDocs(updated, {previousFile});
        numUpdated += 1;
      } catch (err) {
        console.error(`failed to disable alt text for ${asset.name}:`, err);
        failed.push(asset.name);
      }
    }
    setLoading(false);
    if (failed.length > 0) {
      showNotification({
        title: 'Failed to disable alt text',
        message: `Failed to update: ${failed.join(', ')}`,
        color: 'red',
        autoClose: false,
      });
    }
    if (numUpdated > 0) {
      showNotification({
        message: `Disabled alt text for ${numUpdated} file(s).`,
        color: 'green',
      });
    }
    props.onDone();
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title="Disable alt text?"
      size="sm"
      centered
    >
      <div className="AssetBrowser__deleteModal">
        <div className="AssetBrowser__deleteModal__text">
          Disable alt text for <b>{assets.length} file(s)</b>? The alt text
          input is hidden in docs that use these assets and their embedded alt
          text is cleared. Alt text can be re-enabled per asset from its
          details.
        </div>
        <div className="AssetBrowser__deleteModal__buttons">
          <Button variant="default" onClick={props.onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="dark" loading={loading} onClick={() => onConfirm()}>
            Disable alt text
          </Button>
        </div>
      </div>
    </Modal>
  );
}
