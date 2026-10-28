import {
  IconCopy,
  IconCrop,
  IconDownload,
  IconExternalLink,
  IconFile,
  IconFileUpload,
  IconTrash,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {lazy, Suspense} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import {
  UploadedFile,
  getFileExt,
  testIsImageFile,
  testIsVideoFile,
  uploadFileToGCS,
} from '../../../../integrations/gcs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {formatDateTime} from '../../../../utils/time.js';
import {CMSDoc} from '../../../documents/doc.js';
import {
  AssetFile,
  createAssetFile,
  deleteAsset,
  findDocsUsingAsset,
  getAvailableAssetFileName,
  replaceAssetFile,
  replaceFileExt,
  resolveFolderUploadOptions,
  syncAssetToDocs,
  updateAssetAltDisabled,
  updateAssetAltText,
} from '../../assets.js';
import {
  copyAssetUrl,
  downloadAssetFile,
  getAssetPreviewUrl,
} from './AssetPreview.js';

const ImageEditorDialog = lazy(() =>
  import('../../../documents/components/DocEditor/fields/ImageEditorDialog.js').then(
    (m) => ({
      default: m.ImageEditorDialog,
    })
  )
);

/**
 * Image extensions that can be cropped. Other formats (e.g. animated gifs)
 * would lose fidelity when re-encoded by the cropper.
 */
const CROPPABLE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

/** Returns true if the asset is an image that can be cropped. */
export function testIsCroppableAsset(asset: AssetFile): boolean {
  const filename = asset.file?.filename || asset.name;
  return (
    Boolean(asset.file?.src) && CROPPABLE_EXTS.includes(getFileExt(filename))
  );
}

export interface AssetDetailsModalProps {
  asset: AssetFile;
  canManage: boolean;
  /** Whether to open the image cropper when the modal opens. */
  initialCropping?: boolean;
  onClose: () => void;
  /** Called when the asset is changed (e.g. alt text update, file replace). */
  onChanged: (asset: AssetFile) => void;
  /** Called when a new asset is created (e.g. saving a cropped copy). */
  onCreated?: (asset: AssetFile) => void;
  onDeleted: () => void;
}

/**
 * Modal showing an asset's preview, metadata and the list of docs that use
 * it. Editors can update the alt text or replace the file; both changes fan
 * out to all draft docs that embed the asset.
 */
export function AssetDetailsModal(props: AssetDetailsModalProps) {
  const [asset, setAsset] = useState<AssetFile>(props.asset);
  const [altText, setAltText] = useState(props.asset.file?.alt || '');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<File | null>(null);
  const [usageDocs, setUsageDocs] = useState<CMSDoc[] | null>(null);

  const file = asset.file || ({} as UploadedFile);
  const filename = file.filename || asset.name;
  const isImage = testIsImageFile(filename);
  const isVideo = testIsVideoFile(filename);
  const canCrop = props.canManage && testIsCroppableAsset(asset);
  const [cropping, setCropping] = useState(
    Boolean(props.initialCropping && canCrop)
  );
  const altDirty = altText !== (file.alt || '');
  const altDisabled = file.altDisabled === true;

  useEffect(() => {
    findDocsUsingAsset(asset.id)
      .then((docs) => setUsageDocs(docs))
      .catch((err) => {
        console.error('failed to fetch asset usage:', err);
        setUsageDocs([]);
      });
  }, [asset.id]);

  /**
   * Fans an asset update out to all draft docs that use the asset and
   * notifies the user of the result.
   */
  async function syncDocs(updatedAsset: AssetFile, previousFile: UploadedFile) {
    const res = await syncAssetToDocs(updatedAsset, {previousFile});
    if (res.failedDocIds.length > 0) {
      showNotification({
        title: 'Some docs failed to update',
        message: `Failed to update: ${res.failedDocIds.join(', ')}. Re-save the asset to retry.`,
        color: 'red',
        autoClose: false,
      });
    } else if (res.updatedDocIds.length > 0) {
      showNotification({
        message: `Updated ${res.updatedDocIds.length} doc(s) that use this asset.`,
        color: 'green',
      });
    }
  }

  async function onSaveAltText() {
    setSaving(true);
    await notifyErrors(async () => {
      const previousFile = {...file};
      const updated = await updateAssetAltText(asset, altText);
      setAsset(updated);
      props.onChanged(updated);
      await syncDocs(updated, previousFile);
    });
    setSaving(false);
  }

  function onReplaceFile() {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.onchange = () => {
      const newFile = inputEl.files?.[0];
      if (!newFile) {
        return;
      }
      // Replacing a file with a different extension changes the asset's file
      // type and serving URL, so ask for confirmation first.
      const oldExt = getFileExt(filename);
      const newExt = getFileExt(newFile.name);
      if (oldExt && newExt && oldExt !== newExt) {
        setPendingReplace(newFile);
        return;
      }
      replaceFile(newFile);
    };
    inputEl.click();
    inputEl.remove();
  }

  async function replaceFile(newFile: File) {
    setPendingReplace(null);
    setSaving(true);
    await notifyErrors(async () => {
      const previousFile = {...file};
      const uploadOptions = await resolveFolderUploadOptions(asset.parent);
      const uploadedFile = await uploadFileToGCS(newFile, uploadOptions);
      const updated = await replaceAssetFile(asset, uploadedFile);
      setAsset(updated);
      setAltText(updated.file?.alt || '');
      props.onChanged(updated);
      await syncDocs(updated, previousFile);
    });
    setSaving(false);
  }

  /**
   * Replaces the asset's file with a cropped version of the image. The
   * original image is kept as `originalSrc` so it can be restored later.
   */
  async function onSaveCrop(croppedFile: File) {
    setCropping(false);
    setSaving(true);
    await notifyErrors(async () => {
      const previousFile = {...file};
      const uploadOptions = await resolveFolderUploadOptions(asset.parent);
      const uploadedFile = await uploadFileToGCS(croppedFile, uploadOptions);
      uploadedFile.originalSrc = file.originalSrc || file.src;
      const updated = await replaceAssetFile(asset, uploadedFile);
      setAsset(updated);
      props.onChanged(updated);
      showNotification({message: `Cropped "${asset.name}".`, color: 'green'});
      await syncDocs(updated, previousFile);
    });
    setSaving(false);
  }

  /**
   * Saves a cropped version of the image as a new asset in the same folder,
   * leaving the original asset (and docs that use it) untouched.
   */
  async function onSaveCropAsCopy(croppedFile: File) {
    setCropping(false);
    setSaving(true);
    await notifyErrors(async () => {
      const name = await getAvailableAssetFileName(
        asset.parent,
        addNameSuffix(asset.name, '-cropped')
      );
      // Name the uploaded file after the copy so its `filename` (and URL, for
      // folders that preserve filenames) match the new asset.
      const renamedFile = new File([croppedFile], name, {
        type: croppedFile.type,
      });
      const uploadOptions = await resolveFolderUploadOptions(asset.parent);
      const uploadedFile = await uploadFileToGCS(renamedFile, uploadOptions);
      uploadedFile.originalSrc = file.originalSrc || file.src;
      uploadedFile.alt = file.alt;
      uploadedFile.altDisabled = file.altDisabled;
      const created = await createAssetFile({
        parent: asset.parent,
        file: uploadedFile,
        name,
      });
      props.onCreated?.(created);
      showNotification({message: `Saved copy as "${name}".`, color: 'green'});
    });
    setSaving(false);
  }

  async function onToggleAltDisabled(disabled: boolean) {
    setSaving(true);
    await notifyErrors(async () => {
      const previousFile = {...file};
      const updated = await updateAssetAltDisabled(asset, disabled);
      setAsset(updated);
      setAltText(updated.file?.alt || '');
      props.onChanged(updated);
      await syncDocs(updated, previousFile);
    });
    setSaving(false);
  }

  async function onDelete() {
    setSaving(true);
    await notifyErrors(async () => {
      await deleteAsset(asset);
      showNotification({message: `Deleted "${asset.name}".`, color: 'green'});
      props.onDeleted();
    });
    setSaving(false);
  }

  if (cropping) {
    return (
      <Suspense fallback={null}>
        <ImageEditorDialog
          opened
          onClose={() => setCropping(false)}
          src={file.src}
          originalSrc={file.originalSrc}
          filename={filename}
          onSave={(croppedFile) => onSaveCrop(croppedFile)}
          onSaveAsCopy={(croppedFile) => onSaveCropAsCopy(croppedFile)}
        />
      </Suspense>
    );
  }

  return (
    <Dialog
      className="AssetBrowser__detailsModal"
      open
      onClose={props.onClose}
      title={<span className="wrap-anywhere">{asset.name}</span>}
      size={720}
      centered
    >
      <div className="AssetBrowser__details flex flex-col gap-4">
        <div className="AssetBrowser__details__preview flex max-h-80 min-h-30 items-center justify-center overflow-hidden rounded-lg bg-chip">
          {isImage ? (
            <img
              className="block max-h-80 max-w-full object-contain"
              src={getAssetPreviewUrl(file, 800)}
              alt={file.alt || ''}
              style={file.canvasBgColor === 'dark' ? {background: '#000'} : {}}
            />
          ) : isVideo ? (
            <video
              className="block max-h-80 max-w-full object-contain"
              src={file.src}
              controls
              muted
              preload="metadata"
            />
          ) : (
            <div className="AssetBrowser__details__preview__placeholder flex flex-col items-center gap-2 p-6 text-sm text-muted wrap-anywhere">
              <IconFile size={48} stroke="1" />
              <div>{filename}</div>
            </div>
          )}
        </div>

        <Table
          className="AssetBrowser__details__table rounded-none border-0"
          tableClassName="table-fixed"
          dense
        >
          <TableBody>
            <DetailsRow label="Filename">
              <span className="wrap-anywhere">{filename}</span>
            </DetailsRow>
            {Boolean(file.width && file.height) && (
              <DetailsRow label="Dimensions">
                {file.width}x{file.height}
              </DetailsRow>
            )}
            {asset.createdAt && (
              <DetailsRow label="Uploaded">
                {formatDateTime(asset.createdAt)}
                {asset.createdBy && <> by {asset.createdBy}</>}
              </DetailsRow>
            )}
            {asset.modifiedAt && (
              <DetailsRow label="Modified">
                {formatDateTime(asset.modifiedAt)}
                {asset.modifiedBy && <> by {asset.modifiedBy}</>}
              </DetailsRow>
            )}
            <DetailsRow label="URL">
              <div className="AssetBrowser__details__url flex items-center gap-2">
                <TextInput
                  className="min-w-0 flex-1"
                  readOnly
                  aria-label="URL"
                  value={file.src || ''}
                  size="xs"
                  onClick={(e) => e.currentTarget.select()}
                />
                <IconButton
                  size="xs"
                  label="Copy URL"
                  onClick={() => copyAssetUrl(file)}
                >
                  <IconCopy />
                </IconButton>
              </div>
            </DetailsRow>
          </TableBody>
        </Table>

        {(isImage || isVideo) && (
          <div className="AssetBrowser__details__alt flex flex-col items-start gap-2">
            {altDisabled ? (
              <div className="AssetBrowser__details__alt__disabledNote text-sm text-muted">
                Alt text is disabled for this asset. Docs that use it hide the
                alt text input and render no alt text.
              </div>
            ) : (
              <>
                <Textarea
                  className="w-full"
                  label="Alt text"
                  description="Used as the default alt text when the asset is selected in a doc. Updating it syncs docs that use this asset."
                  autosize
                  minRows={1}
                  size="xs"
                  value={altText}
                  disabled={!props.canManage || saving}
                  onInput={(e) => setAltText(e.currentTarget.value)}
                />
                {props.canManage && altDirty && (
                  <Button
                    variant="primary"
                    loading={saving}
                    onClick={() => onSaveAltText()}
                  >
                    Save alt text
                  </Button>
                )}
              </>
            )}
            {props.canManage && (
              <Checkbox
                className="AssetBrowser__details__alt__disableCheckbox"
                label="Disable alt text (e.g. decorative images)"
                checked={altDisabled}
                disabled={saving}
                onChange={(e) => onToggleAltDisabled(e.currentTarget.checked)}
              />
            )}
          </div>
        )}

        <div className="AssetBrowser__details__usage">
          <div className="AssetBrowser__details__usage__title mb-1.5 text-base font-semibold">
            Used in
          </div>
          {usageDocs === null ? (
            <Spinner className="text-muted" />
          ) : usageDocs.length === 0 ? (
            <div className="AssetBrowser__details__usage__empty text-sm text-muted">
              No docs use this asset.
            </div>
          ) : (
            <div className="AssetBrowser__details__usage__list flex max-h-45 flex-col divide-y divide-border overflow-y-auto rounded-sm border border-border">
              {usageDocs.map((cmsDoc) => (
                <a
                  key={cmsDoc.id}
                  className="AssetBrowser__details__usage__doc flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm font-medium text-fg no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                  href={`/cms/content/${cmsDoc.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="min-w-0 wrap-anywhere">{cmsDoc.id}</span>
                  <IconExternalLink className="shrink-0" size={14} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="AssetBrowser__details__buttons flex flex-wrap items-center gap-2">
          <Button
            icon={<IconDownload />}
            onClick={() => downloadAssetFile(file)}
          >
            Download
          </Button>
          {props.canManage && (
            <>
              {canCrop && (
                <Button
                  icon={<IconCrop />}
                  disabled={saving}
                  onClick={() => setCropping(true)}
                >
                  Crop
                </Button>
              )}
              <Button
                icon={<IconFileUpload />}
                loading={saving}
                onClick={() => onReplaceFile()}
              >
                Replace file
              </Button>
              <Button
                className="AssetBrowser__details__buttons__delete ml-auto"
                variant="danger"
                icon={<IconTrash />}
                disabled={saving}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
        {pendingReplace && (
          <div className="AssetBrowser__details__confirmReplace flex flex-col gap-2 rounded-sm bg-warning-soft p-3 text-base text-warning">
            <div>
              The new file has a different type (<b>.{getFileExt(filename)}</b>{' '}
              → <b>.{getFileExt(pendingReplace.name)}</b>). Replacing will
              change the asset's file extension and serving URL
              {replaceFileExt(asset.name, getFileExt(pendingReplace.name)) !==
                asset.name && (
                <>
                  , and the asset will be renamed to{' '}
                  <b>
                    {replaceFileExt(
                      asset.name,
                      getFileExt(pendingReplace.name)
                    )}
                  </b>
                </>
              )}
              . Docs that use this asset will be updated.
            </div>
            <div className="AssetBrowser__details__confirmReplace__buttons flex gap-2">
              <Button onClick={() => setPendingReplace(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={saving}
                onClick={() => replaceFile(pendingReplace)}
              >
                Replace
              </Button>
            </div>
          </div>
        )}
        {confirmingDelete && (
          <div className="AssetBrowser__details__confirmDelete flex flex-col gap-2 rounded-sm bg-danger-soft p-3 text-base text-danger">
            <div>
              Delete <b>{asset.name}</b> from the asset library?
              {usageDocs && usageDocs.length > 0 && (
                <>
                  {' '}
                  This asset is used in {usageDocs.length} doc(s); those docs
                  keep their copy of the file but will no longer receive
                  updates.
                </>
              )}
            </div>
            <div className="AssetBrowser__details__confirmDelete__buttons flex gap-2">
              <Button
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={saving}
                onClick={() => onDelete()}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** A label / value row in the details table. */
function DetailsRow(props: {label: string; children?: ComponentChildren}) {
  return (
    <TableRow>
      <TableCell className="w-25 font-bold">{props.label}</TableCell>
      <TableCell>{props.children}</TableCell>
    </TableRow>
  );
}

/** Adds a suffix before a name's extension, e.g. `a.jpg` -> `a-cropped.jpg`. */
function addNameSuffix(name: string, suffix: string): string {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${name}${suffix}`;
  }
  return `${name.slice(0, dotIndex)}${suffix}${name.slice(dotIndex)}`;
}
