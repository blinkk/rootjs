import './AssetBrowser.css';

import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCloudDownload,
  IconCopy,
  IconCrop,
  IconDotsVertical,
  IconDownload,
  IconFileUpload,
  IconFolder,
  IconFolderPlus,
  IconFolderSymlink,
  IconFolderUp,
  IconInfoCircle,
  IconLetterCase,
  IconPencil,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTrash,
  IconUpload,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {
  Pagination,
  PaginationSummary,
} from '../../../../components/Pagination/Pagination.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePagination} from '../../../../hooks/usePagination.js';
import {
  UploadFileOptions,
  testFileMatchesAccept,
  testIsImageFile,
  testIsVideoFile,
  uploadFileToGCS,
} from '../../../../integrations/gcs.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {
  hideNotification,
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {errorMessage, notifyErrors} from '../../../../utils/notifications.js';
import {getTimeAgo} from '../../../../utils/time.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {getSyncProvider} from '../../asset-sync/registry.js';
import {
  Asset,
  AssetFile,
  AssetFolder,
  AssetFolderContents,
  AssetSort,
  AssetSortDir,
  AssetSortField,
  DEFAULT_ASSET_SORT,
  countFolderContents,
  createAssetFile,
  createAssetFolder,
  createAssetFolderPaths,
  deleteAsset,
  findAssetFile,
  findDocsUsingAsset,
  findPreserveFilenameFolder,
  getAsset,
  getFolderId,
  getRelativeFolderPath,
  joinFolderPath,
  listAssets,
  listAssetsRecursive,
  moveAsset,
  parseFolderPath,
  renameAsset,
  replaceAssetFile,
  resolveFolderUploadOptions,
  sortAssets,
  syncAssetToDocs,
  updateAssetAltDisabled,
  updateFolderPreserveFilename,
  validateFolderPath,
} from '../../assets.js';
import {
  MAX_UPLOAD_FILES,
  UploadFileEntry,
  getUploadFiles,
  getUploadFilesFromDataTransfer,
} from '../../file-tree.js';
import {AssetDetailsModal, testIsCroppableAsset} from './AssetDetailsModal.js';
import {
  AssetThumbnail,
  THUMB_CLASSES,
  copyAssetUrl,
  downloadAssetFile,
  thumbSizeStyle,
} from './AssetPreview.js';
import {
  ConnectSyncModal,
  SyncProgressModal,
  SyncProviderIcon,
} from './AssetSyncModals.js';

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

/** localStorage key the user's preferred sort order is remembered under. */
const SORT_STORAGE_KEY = 'root::AssetBrowser:sort';

/** Classes for the danger callouts in the delete confirmation. */
const WARNING_CLASSES =
  'AssetBrowser__deleteModal__warning rounded-sm bg-danger-soft px-3 py-2 text-base text-danger';

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
  // Sort order of the listing, remembered across sessions. The persisted value
  // is normalized so an unrecognized one falls back to the default order.
  const [storedSort, setSort] = useLocalStorage<AssetSort>(
    SORT_STORAGE_KEY,
    DEFAULT_ASSET_SORT
  );
  const sort = useMemo<AssetSort>(
    () => ({
      field: storedSort?.field === 'modified' ? 'modified' : 'name',
      dir: storedSort?.dir === 'desc' ? 'desc' : 'asc',
    }),
    [storedSort]
  );
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
  const [detailsCropping, setDetailsCropping] = useState(false);
  // Multi-select for bulk actions (manage mode), keyed by asset id.
  const [selected, setSelected] = useState<Map<string, Asset>>(new Map());
  // The current folder's own db doc (for its sync-source connection).
  const [currentFolder, setCurrentFolder] = useState<AssetFolder | null>(null);
  // Path of the current folder or nearest ancestor with "preserve filename"
  // enabled (null when uploads here use the default hashed names).
  const [preserveFilenameFolder, setPreserveFilenameFolder] = useState<
    string | null
  >(null);
  // Folder targeted by the folder settings modal.
  const [folderSettingsTarget, setFolderSettingsTarget] =
    useState<AssetFolder | null>(null);
  // Folder targeted by the sync settings / sync run modals.
  const [syncSettingsTarget, setSyncSettingsTarget] =
    useState<AssetFolder | null>(null);
  const [syncRunTarget, setSyncRunTarget] = useState<AssetFolder | null>(null);

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
      const [res, folderAsset, preserveFolder] = await withTimeout(
        Promise.all([
          listAssets(folderPath),
          // Fetch the current folder's own doc (for its sync connection).
          folderPath
            ? getAsset(getFolderId(folderPath))
            : Promise.resolve(null),
          findPreserveFilenameFolder(folderPath),
        ]),
        undefined,
        'loading assets'
      );
      setAssets(res);
      setCurrentFolder(
        folderAsset && folderAsset.type === 'folder' ? folderAsset : null
      );
      setPreserveFilenameFolder(preserveFolder);
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
    return sortAssets(res, sort);
  }, [assets, searchIndex, filter, sort, props.mode, props.accept]);

  // Paginate the listing, resetting to the first page when the folder, the
  // search filter or the sort order changes.
  const pagination = usePagination(filteredAssets, {
    pageSize: PAGE_SIZE,
    resetDeps: [folder, filter, sort.field, sort.dir],
  });
  const pageItems = pagination.pageItems;

  /**
   * Uploads files into the current folder. Entries that came from a folder
   * upload carry the folder path they were nested under, which is mirrored in
   * the asset library (creating any missing folders) before the files are
   * uploaded into it. A file whose destination folder already has a file of
   * the same name replaces that file in place (and the change fans out to
   * docs that use it) rather than creating a duplicate entry.
   */
  async function uploadFiles(entries: UploadFileEntry[]) {
    if (entries.length === 0 || uploading) {
      return;
    }
    const notificationId = 'asset-browser-upload';
    setUploading(true);
    if (entries.length >= MAX_UPLOAD_FILES) {
      showNotification({
        title: 'Upload truncated',
        message: `Only the first ${MAX_UPLOAD_FILES} files are uploaded at a time.`,
        color: 'yellow',
        autoClose: false,
      });
    }
    showNotification({
      id: notificationId,
      message: `Uploading ${entries.length} file(s)...`,
      loading: true,
      autoClose: false,
      disallowClose: true,
    });
    const uploaded: AssetFile[] = [];
    const failed: string[] = [];
    // Existing assets that were replaced by a same-named upload.
    const replaced: AssetFile[] = [];
    // Docs that failed to pick up a replaced asset's new file.
    const failedDocIds = new Set<string>();

    // Resolve each file's destination folder up front so that files with a
    // path the asset library can't represent are skipped individually.
    const items: Array<{file: File; label: string; parent: string}> = [];
    const folderPaths = new Set<string>();
    for (const entry of entries) {
      try {
        const relativePath = validateFolderPath(entry.path);
        if (relativePath) {
          folderPaths.add(relativePath);
        }
        items.push({
          file: entry.file,
          label: relativePath
            ? `${relativePath}/${entry.file.name}`
            : entry.file.name,
          parent: joinFolderPath(folder, relativePath),
        });
      } catch (err) {
        console.error(`invalid upload path for ${entry.file.name}:`, err);
        failed.push(entry.file.name);
      }
    }

    if (folderPaths.size > 0) {
      try {
        await createAssetFolderPaths(folder, Array.from(folderPaths));
      } catch (err) {
        // Without their db docs the uploaded folders wouldn't show up in the
        // listing, so bail out before uploading any files.
        console.error('failed to create upload folders:', err);
        hideNotification(notificationId);
        setUploading(false);
        showNotification({
          title: 'Upload failed',
          message: `Failed to create folders: ${errorMessage(err)}`,
          color: 'red',
          autoClose: false,
        });
        return;
      }
    }

    // Upload options (e.g. the inherited "preserve filename" setting) are
    // resolved once per destination folder: a folder upload can land files in
    // existing subfolders that carry their own setting.
    const uploadOptionsByFolder = new Map<string, Promise<UploadFileOptions>>();
    function getUploadOptions(parent: string): Promise<UploadFileOptions> {
      let options = uploadOptionsByFolder.get(parent);
      if (!options) {
        options = resolveFolderUploadOptions(parent);
        uploadOptionsByFolder.set(parent, options);
      }
      return options;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      updateNotification({
        id: notificationId,
        message: `Uploading ${item.label} (${i + 1} of ${items.length})...`,
        loading: true,
        autoClose: false,
        disallowClose: true,
      });
      try {
        const existing = await findAssetFile(
          item.parent,
          item.file.name.trim()
        );
        const uploadOptions = await getUploadOptions(item.parent);
        const uploadedFile = await uploadFileToGCS(item.file, uploadOptions);
        if (existing) {
          const previousFile = existing.file;
          const asset = await replaceAssetFile(existing, uploadedFile);
          uploaded.push(asset);
          replaced.push(asset);
          const res = await syncAssetToDocs(asset, {previousFile});
          res.failedDocIds.forEach((docId) => failedDocIds.add(docId));
        } else {
          const asset = await createAssetFile({
            parent: item.parent,
            file: uploadedFile,
          });
          uploaded.push(asset);
        }
      } catch (err) {
        console.error(`failed to upload ${item.label}:`, err);
        failed.push(item.label);
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
      const parts = [`Uploaded ${uploaded.length} file(s).`];
      if (replaced.length > 0) {
        parts.push(`Replaced ${replaced.length} existing file(s).`);
      }
      showNotification({message: parts.join(' '), color: 'green'});
    }
    if (failedDocIds.size > 0) {
      showNotification({
        title: 'Some docs failed to update',
        message: `Failed to update: ${Array.from(failedDocIds).join(', ')}. Re-save the asset to retry.`,
        color: 'red',
        autoClose: false,
      });
    }
    await reload(folder);
    // In pick mode, uploading a single file selects it immediately.
    if (
      props.mode === 'pick' &&
      uploaded.length === 1 &&
      entries.length === 1 &&
      !entries[0].path &&
      props.onPickFile
    ) {
      props.onPickFile(uploaded[0]);
    }
  }

  function requestUpload(options?: {directory?: boolean}) {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.multiple = true;
    if (options?.directory) {
      // Non-standard attributes for the directory picker. `webkitdirectory` is
      // supported by all major browsers; `directory` is the unprefixed name.
      inputEl.setAttribute('webkitdirectory', '');
      inputEl.setAttribute('directory', '');
    } else if (
      props.mode === 'pick' &&
      props.accept &&
      props.accept.length > 0
    ) {
      inputEl.accept = props.accept.join(',');
    }
    inputEl.onchange = () => {
      uploadFiles(getUploadFiles(inputEl.files));
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
      className={cn(
        'AssetBrowser',
        `AssetBrowser--mode-${props.mode}`,
        'min-w-0',
        props.className
      )}
    >
      <div className="AssetBrowser__toolbar mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="AssetBrowser__toolbar__folder flex min-w-0 items-center gap-1">
          <AssetBrowser.Breadcrumbs folder={folder} onNavigate={setFolder} />
          {props.mode === 'manage' && preserveFilenameFolder !== null && (
            <span
              className="AssetBrowser__toolbar__preserveBadge inline-flex items-center text-muted"
              title={`Uploads to this folder preserve filenames (set on "${preserveFilenameFolder}")`}
            >
              <IconLetterCase size={14} />
            </span>
          )}
          {props.mode === 'manage' && canManage && currentFolder && (
            <IconButton
              className="AssetBrowser__toolbar__folderSettings text-muted"
              size="xs"
              label="Folder settings"
              onClick={() => setFolderSettingsTarget(currentFolder)}
            >
              <IconSettings />
            </IconButton>
          )}
        </div>
        <div className="AssetBrowser__toolbar__actions flex flex-wrap items-center gap-2">
          <TextInput
            className="AssetBrowser__toolbar__filter w-full sm:w-45"
            placeholder="Search by name"
            aria-label="Search by name"
            leftSection={<IconSearch />}
            value={filter}
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
          {props.mode === 'manage' &&
            canManage &&
            currentFolder &&
            (currentFolder.sync ? (
              <Button
                icon={<IconRefresh />}
                onClick={() => setSyncRunTarget(currentFolder)}
              >
                Sync
              </Button>
            ) : (
              <Button
                icon={<IconCloudDownload />}
                onClick={() => setSyncSettingsTarget(currentFolder)}
              >
                Connect sync source
              </Button>
            ))}
          {showUpload && props.mode === 'manage' && (
            <Button
              icon={<IconFolderPlus />}
              onClick={() => setNewFolderModalOpened(true)}
            >
              New folder
            </Button>
          )}
          {showUpload &&
            (props.mode === 'manage' ? (
              <Menu
                placement="bottom-end"
                trigger={
                  <Button
                    variant="primary"
                    icon={<IconUpload />}
                    loading={uploading}
                  >
                    Upload
                  </Button>
                }
              >
                <MenuItem
                  icon={<IconFileUpload />}
                  onClick={() => requestUpload()}
                >
                  Upload files
                </MenuItem>
                <MenuItem
                  icon={<IconFolderUp />}
                  onClick={() => requestUpload({directory: true})}
                >
                  Upload folder
                </MenuItem>
              </Menu>
            ) : (
              <Button
                variant="primary"
                icon={<IconUpload />}
                loading={uploading}
                onClick={() => requestUpload()}
              >
                Upload
              </Button>
            ))}
        </div>
      </div>
      {props.mode === 'manage' && currentFolder?.sync && !searching && (
        <AssetSyncBar
          folder={currentFolder}
          canManage={canManage}
          onSettings={() => setSyncSettingsTarget(currentFolder)}
        />
      )}
      {showSelection && selectedAssets.length > 0 && (
        <div className="AssetBrowser__selectionBar mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-chip px-3 py-1.5">
          <div className="AssetBrowser__selectionBar__count text-sm font-semibold">
            {selectedAssets.length} selected
          </div>
          <div className="AssetBrowser__selectionBar__actions flex flex-wrap items-center gap-2">
            <Button
              icon={<IconFolderSymlink />}
              onClick={() => setMoveTarget(selectedAssets)}
            >
              Move
            </Button>
            {selectedAltFiles.length > 0 && (
              <Button onClick={() => setDisableAltTarget(selectedAltFiles)}>
                Disable alt text
              </Button>
            )}
            <Button
              variant="danger"
              icon={<IconTrash />}
              onClick={() => setDeleteTarget(selectedAssets)}
            >
              Delete
            </Button>
            <Button variant="subtle" onClick={() => setSelected(new Map())}>
              Clear
            </Button>
          </div>
        </div>
      )}
      <div
        className={cn(
          'AssetBrowser__listing',
          'relative rounded-lg border border-border bg-surface',
          // The picker's listing scrolls (see AssetBrowser.css for its height).
          props.mode === 'pick' ? 'overflow-y-auto' : 'overflow-hidden',
          dragging &&
            'AssetBrowser__listing--dragging outline-2 -outline-offset-4 outline-muted outline-dashed'
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
          // `dataTransfer` is only valid during the event, so the dropped
          // items are read synchronously here and awaited below.
          const uploadFilesPromise = getUploadFilesFromDataTransfer(
            e.dataTransfer
          );
          notifyErrors(async () => {
            await uploadFiles(await uploadFilesPromise);
          });
        }}
      >
        {loading || (searching && searchIndex === null) ? (
          <div className="AssetBrowser__loading flex min-h-40 flex-col items-center justify-center gap-1 p-5 text-muted">
            <Spinner size="lg" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div
            className="AssetBrowser__empty flex min-h-40 flex-col items-center justify-center gap-1 p-5 text-center text-sm text-muted"
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
                    Drop files or folders here or click "Upload" to add assets.
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <Table
            className="AssetBrowser__table rounded-none border-0"
            label="Assets"
            hover
          >
            <TableHead>
              <TableRow>
                {showSelection && (
                  <TableHeaderCell className="AssetBrowser__table__checkboxCol w-0">
                    <Checkbox
                      aria-label="Select all"
                      checked={allSelected}
                      indeterminate={
                        !allSelected &&
                        pageItems.some((asset) => selected.has(asset.id))
                      }
                      onChange={() => toggleSelectAll()}
                    />
                  </TableHeaderCell>
                )}
                <AssetSortHeader
                  field="name"
                  label="name"
                  sort={sort}
                  onSort={setSort}
                />
                <AssetSortHeader
                  className="AssetBrowser__table__modifiedCol md:w-50"
                  field="modified"
                  label="modified"
                  sort={sort}
                  onSort={setSort}
                />
                <TableHeaderCell className="AssetBrowser__table__actionsCol w-0">
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageItems.map((asset) =>
                asset.type === 'folder' ? (
                  <TableRow
                    key={asset.id}
                    className="AssetBrowser__row AssetBrowser__row--folder cursor-pointer"
                    onClick={() =>
                      setFolder(joinFolderPath(asset.parent, asset.name))
                    }
                  >
                    {showSelection && (
                      <TableCell
                        className="AssetBrowser__checkboxCell cursor-default"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Select ${asset.name}`}
                          checked={selected.has(asset.id)}
                          onChange={() => toggleSelected(asset)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="AssetBrowser__nameCell flex items-center gap-2.5">
                        <div
                          className={cn(
                            'AssetBrowser__thumb',
                            THUMB_CLASSES,
                            'bg-transparent'
                          )}
                          style={thumbSizeStyle(36)}
                        >
                          <IconFolder size={24} stroke="1.5" />
                        </div>
                        <div className="AssetBrowser__nameCell__text flex min-w-0 flex-col items-start gap-px">
                          <div className="AssetBrowser__nameCell__name font-medium break-words">
                            {asset.name}
                            {asset.sync && (
                              <span
                                className="AssetBrowser__syncBadge ml-1.5 inline-flex items-center align-middle text-muted"
                                title={`Synced from ${
                                  getSyncProvider(asset.sync.provider)?.label ||
                                  asset.sync.provider
                                }`}
                              >
                                <SyncProviderIcon
                                  provider={asset.sync.provider}
                                  size={12}
                                />
                              </span>
                            )}
                            {asset.preserveFilename && (
                              <span
                                className="AssetBrowser__preserveBadge ml-1.5 inline-flex items-center align-middle text-muted"
                                title="Uploads to this folder preserve filenames"
                              >
                                <IconLetterCase size={12} />
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
                    </TableCell>
                    <TableCell>
                      <AssetModifiedBy asset={asset} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="AssetBrowser__actionsCell flex items-center justify-end">
                        {props.mode === 'manage' && canManage && (
                          <Menu
                            placement="bottom-end"
                            trigger={
                              <IconButton size="xs" label="More actions">
                                <IconDotsVertical />
                              </IconButton>
                            }
                          >
                            <MenuItem
                              icon={<IconPencil />}
                              onClick={() => setRenameTarget(asset)}
                            >
                              Rename
                            </MenuItem>
                            <MenuItem
                              icon={<IconFolderSymlink />}
                              onClick={() => setMoveTarget([asset])}
                            >
                              Move
                            </MenuItem>
                            <MenuItem
                              icon={<IconSettings />}
                              onClick={() => setFolderSettingsTarget(asset)}
                            >
                              Folder settings
                            </MenuItem>
                            <MenuItem
                              danger
                              icon={<IconTrash />}
                              onClick={() => setDeleteTarget([asset])}
                            >
                              Delete
                            </MenuItem>
                          </Menu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow
                    key={asset.id}
                    className="AssetBrowser__row AssetBrowser__row--file cursor-pointer"
                    onClick={() => {
                      if (props.mode === 'pick') {
                        onPickFile(asset);
                      } else {
                        setDetailsTarget(asset);
                      }
                    }}
                  >
                    {showSelection && (
                      <TableCell
                        className="AssetBrowser__checkboxCell cursor-default"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Select ${asset.name}`}
                          checked={selected.has(asset.id)}
                          onChange={() => toggleSelected(asset)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="AssetBrowser__nameCell flex items-center gap-2.5">
                        <AssetThumbnail file={asset.file} size={36} />
                        <div className="AssetBrowser__nameCell__text flex min-w-0 flex-col items-start gap-px">
                          <div className="AssetBrowser__nameCell__name font-medium break-words">
                            {asset.name}
                            {Boolean(
                              asset.file?.width && asset.file?.height
                            ) && (
                              <span className="AssetBrowser__nameCell__dimens font-normal text-muted">
                                {' '}
                                ({asset.file.width}x{asset.file.height})
                              </span>
                            )}
                            {asset.source?.missingSince && (
                              <span
                                className="AssetBrowser__missingBadge ml-1.5 inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-px align-middle text-xs font-normal text-warning"
                                title="This asset no longer exists at its sync source. It is kept here since docs may still use it; delete it manually if unused."
                              >
                                <IconAlertTriangle size={12} />
                                removed in source
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
                    </TableCell>
                    <TableCell>
                      <AssetModifiedBy asset={asset} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="AssetBrowser__actionsCell flex items-center justify-end">
                        {props.mode !== 'pick' && (
                          <FileActionsMenu
                            asset={asset}
                            canManage={canManage}
                            onDetails={() => setDetailsTarget(asset)}
                            onCrop={() => {
                              setDetailsCropping(true);
                              setDetailsTarget(asset);
                            }}
                            onRename={() => setRenameTarget(asset)}
                            onMove={() => setMoveTarget([asset])}
                            onDelete={() => setDeleteTarget([asset])}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="AssetBrowser__footer flex flex-wrap items-center justify-between gap-3">
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
        preserveFilenameInheritedFrom={preserveFilenameFolder}
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
          initialCropping={detailsCropping}
          onClose={() => {
            setDetailsTarget(null);
            setDetailsCropping(false);
          }}
          onChanged={() => reload(folder)}
          onCreated={() => reload(folder)}
          onDeleted={() => {
            setDetailsTarget(null);
            setDetailsCropping(false);
            reload(folder);
          }}
        />
      )}
      {folderSettingsTarget && (
        <FolderSettingsModal
          folder={folderSettingsTarget}
          onClose={() => setFolderSettingsTarget(null)}
          onSaved={() => {
            setFolderSettingsTarget(null);
            reload(folder);
          }}
        />
      )}
      {syncSettingsTarget && (
        <ConnectSyncModal
          folder={syncSettingsTarget}
          onClose={() => setSyncSettingsTarget(null)}
          onConnected={(updatedFolder, runSync) => {
            setSyncSettingsTarget(null);
            reload(folder);
            if (runSync) {
              setSyncRunTarget(updatedFolder);
            }
          }}
          onDisconnected={() => {
            setSyncSettingsTarget(null);
            reload(folder);
          }}
        />
      )}
      {syncRunTarget && (
        <SyncProgressModal
          folder={syncRunTarget}
          onClose={() => setSyncRunTarget(null)}
          onSynced={() => reload(folder)}
        />
      )}
    </div>
  );
}

/**
 * Header strip shown inside a folder that is connected to a sync source
 * (e.g. a Figma file), with the last-synced status and a shortcut to the
 * sync settings. The sync action itself is the "Sync" toolbar button.
 */
function AssetSyncBar(props: {
  folder: AssetFolder;
  canManage: boolean;
  onSettings: () => void;
}) {
  const sync = props.folder.sync!;
  const provider = getSyncProvider(sync.provider);
  const lastSyncedMillis =
    sync.lastSyncedAt && typeof sync.lastSyncedAt.toMillis === 'function'
      ? sync.lastSyncedAt.toMillis()
      : 0;
  return (
    <div className="AssetBrowser__syncBar mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-chip px-3 py-1.5">
      <div className="AssetBrowser__syncBar__info flex min-w-0 items-center gap-2 text-sm">
        <span className="flex shrink-0">
          <SyncProviderIcon provider={sync.provider} size={16} />
        </span>
        <span className="min-w-0">
          Synced from{' '}
          <a
            className="font-semibold text-inherit"
            href={sync.url}
            target="_blank"
            rel="noreferrer"
          >
            {provider?.label || sync.provider}
          </a>
          {lastSyncedMillis ? (
            <>
              {' '}
              · last synced {getTimeAgo(lastSyncedMillis)}
              {sync.lastSyncedBy ? ` by ${sync.lastSyncedBy}` : ''}
            </>
          ) : (
            <> · never synced</>
          )}
          {sync.lastSyncResult && !sync.lastSyncResult.ok && (
            <span className="AssetBrowser__syncBar__warning text-warning">
              {' '}
              · last sync had errors
            </span>
          )}
        </span>
      </div>
      {props.canManage && (
        <div className="AssetBrowser__syncBar__actions flex items-center gap-2">
          <IconButton
            size="xs"
            label="Sync settings"
            onClick={props.onSettings}
          >
            <IconSettings />
          </IconButton>
        </div>
      )}
    </div>
  );
}

/**
 * Direction applied when a sort header is clicked. Activating a column uses
 * its default direction (A-Z for names, most recent first for dates);
 * clicking the already-active column toggles the direction.
 */
function nextSortDir(
  field: AssetSortField,
  activeDir: AssetSortDir | null
): AssetSortDir {
  if (activeDir === 'asc') {
    return 'desc';
  }
  if (activeDir === 'desc') {
    return 'asc';
  }
  return field === 'modified' ? 'desc' : 'asc';
}

/** A clickable table header cell that sorts the listing by its column. */
function AssetSortHeader(props: {
  className?: string;
  field: AssetSortField;
  label: string;
  sort: AssetSort;
  onSort: (sort: AssetSort) => void;
}) {
  const active = props.sort.field === props.field;
  const dir = active ? props.sort.dir : null;
  return (
    <TableHeaderCell
      className={props.className}
      aria-sort={
        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
      }
    >
      <button
        type="button"
        className={cn(
          'AssetBrowser__table__sortHeader',
          'm-0 inline-flex cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent p-0 text-left font-sans text-sm font-bold text-inherit hover:text-fg',
          active && 'AssetBrowser__table__sortHeader--active text-fg'
        )}
        aria-label={`Sort by ${props.label}`}
        onClick={() =>
          props.onSort({field: props.field, dir: nextSortDir(props.field, dir)})
        }
      >
        <span>{props.label}</span>
        {dir === 'asc' ? (
          <IconChevronUp size={12} stroke={2.5} />
        ) : dir === 'desc' ? (
          <IconChevronDown size={12} stroke={2.5} />
        ) : null}
      </button>
    </TableHeaderCell>
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
    <Breadcrumbs
      className="AssetBrowser__breadcrumbs flex min-h-7 items-center"
      aria-label="Folder"
      current="location"
      separator={<IconChevronRight size={14} className="block" />}
      items={crumbs.map((crumb) => ({
        label: crumb.label,
        onClick: () => props.onNavigate(crumb.path),
      }))}
    />
  );
};

function FileActionsMenu(props: {
  asset: AssetFile;
  canManage: boolean;
  onDetails: () => void;
  onCrop: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const asset = props.asset;
  return (
    <Menu
      placement="bottom-end"
      trigger={
        <IconButton size="xs" label="More actions">
          <IconDotsVertical />
        </IconButton>
      }
    >
      <MenuItem icon={<IconInfoCircle />} onClick={props.onDetails}>
        Details
      </MenuItem>
      <MenuItem icon={<IconCopy />} onClick={() => copyAssetUrl(asset.file)}>
        Copy URL
      </MenuItem>
      <MenuItem
        icon={<IconDownload />}
        onClick={() => downloadAssetFile(asset.file)}
      >
        Download
      </MenuItem>
      {props.canManage && (
        <>
          {testIsCroppableAsset(asset) && (
            <MenuItem icon={<IconCrop />} onClick={props.onCrop}>
              Crop
            </MenuItem>
          )}
          <MenuItem icon={<IconPencil />} onClick={props.onRename}>
            Rename
          </MenuItem>
          <MenuItem icon={<IconFolderSymlink />} onClick={props.onMove}>
            Move
          </MenuItem>
          <MenuItem danger icon={<IconTrash />} onClick={props.onDelete}>
            Delete
          </MenuItem>
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
      type="button"
      className="AssetBrowser__nameCell__path m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left font-sans text-xs text-muted break-words hover:underline"
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
    <div className="AssetBrowser__modifiedCell flex items-center gap-2 whitespace-nowrap">
      {by && <UserAvatar email={by} size={20} />}
      <span>{millis ? getTimeAgo(millis) : '—'}</span>
    </div>
  );
}

function NewFolderModal(props: {
  opened: boolean;
  parent: string;
  /**
   * Path of the ancestor folder that already enables "preserve filename"
   * (the new folder inherits it), or null.
   */
  preserveFilenameInheritedFrom: string | null;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [preserveFilename, setPreserveFilename] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    await notifyErrors(async () => {
      const folder = await createAssetFolder(props.parent, name, {
        preserveFilename,
      });
      setName('');
      setPreserveFilename(false);
      props.onCreated(folder.name);
    });
    setLoading(false);
  }

  return (
    <Dialog
      open={props.opened}
      onClose={props.onClose}
      title="New folder"
      size="sm"
      centered
    >
      <form
        className="AssetBrowser__modalForm flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <TextInput
          data-autofocus
          size="md"
          placeholder="Folder name"
          aria-label="Folder name"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <PreserveFilenameCheckbox
          checked={preserveFilename}
          inheritedFrom={props.preserveFilenameInheritedFrom}
          disabled={loading}
          onChange={setPreserveFilename}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={loading}
          disabled={!name}
        >
          Create
        </Button>
      </form>
    </Dialog>
  );
}

/**
 * Checkbox for a folder's "preserve filename" upload setting. When an
 * ancestor folder already enables the setting it is inherited, so the
 * checkbox is shown checked and locked with a note pointing at that folder.
 */
function PreserveFilenameCheckbox(props: {
  checked: boolean;
  /** Path of the ancestor folder the setting is inherited from, if any. */
  inheritedFrom: string | null;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const inherited = props.inheritedFrom !== null;
  return (
    <div>
      <Checkbox
        label="Preserve filenames when uploading"
        description="Uploaded files keep their original filename at the end of the file URL (e.g. …/<hash>/report.pdf) instead of a content hash. Applies to this folder and its subfolders."
        checked={inherited || props.checked}
        disabled={inherited || props.disabled}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      {inherited && (
        <div className="AssetBrowser__folderSettings__inherited mt-1 text-sm text-muted">
          Inherited from the folder <b>{props.inheritedFrom}</b>. Change the
          setting there to disable it.
        </div>
      )}
    </div>
  );
}

/** Modal for editing a folder's settings (currently "preserve filename"). */
function FolderSettingsModal(props: {
  folder: AssetFolder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const folder = props.folder;
  const folderPath = joinFolderPath(folder.parent, folder.name);
  const [preserveFilename, setPreserveFilename] = useState(
    !!folder.preserveFilename
  );
  // Nearest ancestor with "preserve filename" enabled (undefined = loading).
  const [inheritedFrom, setInheritedFrom] = useState<string | null | undefined>(
    undefined
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let res: string | null = null;
      await notifyErrors(async () => {
        res = await findPreserveFilenameFolder(folder.parent);
      });
      if (!cancelled) {
        setInheritedFrom(res);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folder.parent]);

  const dirty = preserveFilename !== !!folder.preserveFilename;

  async function onSubmit() {
    setSaving(true);
    await notifyErrors(async () => {
      if (dirty) {
        await updateFolderPreserveFilename(folder, preserveFilename);
        showNotification({
          message: `Updated settings for "${folderPath}".`,
          color: 'green',
        });
      }
      props.onSaved();
    });
    setSaving(false);
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={`Folder settings: ${folderPath}`}
      size="md"
      centered
    >
      <form
        className="AssetBrowser__folderSettings flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {inheritedFrom === undefined ? (
          <Spinner className="text-muted" />
        ) : (
          <PreserveFilenameCheckbox
            checked={preserveFilename}
            inheritedFrom={inheritedFrom}
            disabled={saving}
            onChange={setPreserveFilename}
          />
        )}
        <div className="AssetBrowser__folderSettings__buttons flex justify-end gap-2">
          <Button onClick={props.onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={inheritedFrom === undefined || !dirty}
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
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
    <Dialog
      open
      onClose={props.onClose}
      title={`Rename ${props.asset.type}`}
      size="sm"
      centered
    >
      <form
        className="AssetBrowser__modalForm flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <TextInput
          data-autofocus
          size="md"
          aria-label="Name"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={loading}
          disabled={!name}
        >
          Rename
        </Button>
      </form>
    </Dialog>
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
    <Dialog
      open
      onClose={props.onClose}
      title={
        assets.length === 1
          ? `Move "${assets[0].name}"`
          : `Move ${assets.length} items`
      }
      size="md"
      centered
    >
      <div className="AssetBrowser__moveModal flex flex-col gap-3">
        <AssetBrowser.Breadcrumbs folder={path} onNavigate={setPath} />
        <div className="AssetBrowser__moveModal__folders flex max-h-60 min-h-30 flex-col overflow-y-auto rounded-sm border border-border p-1">
          {loading ? (
            <Spinner className="text-muted" />
          ) : folders.length === 0 ? (
            <div className="AssetBrowser__moveModal__empty flex flex-1 items-center justify-center text-sm text-muted">
              No subfolders.
            </div>
          ) : (
            folders.map((folderAsset) => {
              const folderPath = joinFolderPath(
                folderAsset.parent,
                folderAsset.name
              );
              return (
                <button
                  type="button"
                  key={folderAsset.id}
                  className="AssetBrowser__moveModal__folder m-0 flex shrink-0 cursor-pointer appearance-none items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left font-sans text-sm text-fg enabled:hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-focus"
                  disabled={isDisabledFolder(folderPath)}
                  onClick={() => setPath(folderPath)}
                >
                  <IconFolder size={16} stroke="1.5" />
                  <span className="flex-1 wrap-anywhere">
                    {folderAsset.name}
                  </span>
                  <IconChevronRight size={14} />
                </button>
              );
            })
          )}
        </div>
        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={moving}
          disabled={assets.every((asset) => asset.parent === path)}
          onClick={() => onMove()}
        >
          Move here
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Max files for which doc usage is looked up before deleting. Usage requires
 * a query per file per collection, so very large selections skip the check.
 */
const MAX_USAGE_LOOKUPS = 20;

/**
 * Max folders whose contents are counted before deleting. Each count is a
 * query, so very large selections skip the check and fall back to a generic
 * warning.
 */
const MAX_FOLDER_LOOKUPS = 20;

/**
 * Formats a recursive folder content count for the delete warning, e.g.
 * `3 file(s) and 1 folder(s)`.
 */
function formatFolderContents(contents: AssetFolderContents): string {
  const parts: string[] = [];
  if (contents.files > 0) {
    parts.push(`${contents.files} file(s)`);
  }
  if (contents.folders > 0) {
    parts.push(`${contents.folders} folder(s)`);
  }
  return parts.join(' and ');
}

/**
 * Confirmation modal for deleting assets. Selected folders are checked for
 * contents first so that deleting a non-empty folder warns about the nested
 * assets it removes instead of failing.
 */
function DeleteAssetModal(props: {
  assets: Asset[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const assets = props.assets;
  const files = assets.filter((asset) => asset.type === 'file');
  const folders = assets.filter(
    (asset) => asset.type === 'folder'
  ) as AssetFolder[];
  const assetIds = assets.map((asset) => asset.id).join(',');

  const [loading, setLoading] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [folderContents, setFolderContents] =
    useState<AssetFolderContents | null>(null);
  // Initialized to the value the effect below uses so the first render already
  // shows the pending check instead of flashing the unknown-contents warning.
  const [checkingFolders, setCheckingFolders] = useState(
    folders.length > 0 && folders.length <= MAX_FOLDER_LOOKUPS
  );

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
  }, [assetIds]);

  useEffect(() => {
    if (folders.length === 0 || folders.length > MAX_FOLDER_LOOKUPS) {
      return;
    }
    setCheckingFolders(true);
    Promise.all(folders.map((folder) => countFolderContents(folder)))
      .then((results) => {
        setFolderContents({
          files: results.reduce((total, res) => total + res.files, 0),
          folders: results.reduce((total, res) => total + res.folders, 0),
          total: results.reduce((total, res) => total + res.total, 0),
        });
      })
      .catch((err) => {
        console.error('failed to count folder contents:', err);
        setFolderContents(null);
      })
      .finally(() => setCheckingFolders(false));
  }, [assetIds]);

  // Folders are only known to be empty once the check above succeeds; an
  // unknown count still warns since the delete removes nested assets.
  const deletesFolderContents =
    folders.length > 0 && (!folderContents || folderContents.total > 0);

  async function onDelete() {
    setLoading(true);
    const failed: string[] = [];
    let numDeleted = 0;
    for (const asset of assets) {
      try {
        await deleteAsset(asset, {recursive: true});
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
        message: `Failed to delete: ${failed.join(', ')}.`,
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
    <Dialog
      open
      onClose={props.onClose}
      title={
        assets.length === 1
          ? `Delete ${assets[0].type}?`
          : `Delete ${assets.length} items?`
      }
      size="sm"
      centered
    >
      <div className="AssetBrowser__deleteModal flex flex-col gap-3">
        <div className="AssetBrowser__deleteModal__text text-base wrap-anywhere">
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
        </div>
        {checkingFolders && (
          <div className="AssetBrowser__deleteModal__checking flex items-center gap-2 text-base text-muted">
            <Spinner size="sm" label={null} />
            <span>Checking folder contents...</span>
          </div>
        )}
        {!checkingFolders && deletesFolderContents && (
          <div className={WARNING_CLASSES}>
            {folders.length === 1 ? 'This folder is' : 'These folders are'} not
            empty.{' '}
            {folderContents
              ? `Deleting also permanently removes the ${formatFolderContents(
                  folderContents
                )} nested inside.`
              : 'Deleting also permanently removes everything nested inside.'}
          </div>
        )}
        {usageCount !== null && usageCount > 0 && (
          <div className={WARNING_CLASSES}>
            {assets.length === 1 ? 'This asset is' : 'These assets are'}{' '}
            currently used in {usageCount} doc(s). Those docs will no longer
            receive updates when the asset changes.
          </div>
        )}
        <div className="AssetBrowser__deleteModal__buttons flex justify-end gap-2">
          <Button size="md" onClick={props.onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            loading={loading}
            disabled={checkingFolders}
            onClick={() => onDelete()}
          >
            {deletesFolderContents ? 'Delete all' : 'Delete'}
          </Button>
        </div>
      </div>
    </Dialog>
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
    <Dialog
      open
      onClose={props.onClose}
      title="Disable alt text?"
      size="sm"
      centered
    >
      <div className="AssetBrowser__deleteModal flex flex-col gap-3">
        <div className="AssetBrowser__deleteModal__text text-base">
          Disable alt text for <b>{assets.length} file(s)</b>? The alt text
          input is hidden in docs that use these assets and their embedded alt
          text is cleared. Alt text can be re-enabled per asset from its
          details.
        </div>
        <div className="AssetBrowser__deleteModal__buttons flex justify-end gap-2">
          <Button size="md" onClick={props.onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={loading}
            onClick={() => onConfirm()}
          >
            Disable alt text
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
