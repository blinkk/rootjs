import {
  ActionIcon,
  Button,
  Loader,
  Modal,
  Table,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFile,
  IconFileUpload,
  IconTrash,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import {
  AssetFile,
  deleteAsset,
  findDocsUsingAsset,
  replaceAssetFile,
  syncAssetToDocs,
  updateAssetAltText,
} from '../../utils/assets.js';
import {CMSDoc} from '../../utils/doc.js';
import {
  UploadedFile,
  testIsImageFile,
  testIsVideoFile,
  uploadFileToGCS,
} from '../../utils/gcs.js';
import {notifyErrors} from '../../utils/notifications.js';
import {formatDateTime} from '../../utils/time.js';
import {
  copyAssetUrl,
  downloadAssetFile,
  getAssetPreviewUrl,
} from './AssetPreview.js';

export interface AssetDetailsModalProps {
  asset: AssetFile;
  canManage: boolean;
  onClose: () => void;
  /** Called when the asset is changed (e.g. alt text update, file replace). */
  onChanged: (asset: AssetFile) => void;
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
  const [usageDocs, setUsageDocs] = useState<CMSDoc[] | null>(null);

  const file = asset.file || ({} as UploadedFile);
  const filename = file.filename || asset.name;
  const isImage = testIsImageFile(filename);
  const isVideo = testIsVideoFile(filename);
  const altDirty = altText !== (file.alt || '');

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
    inputEl.onchange = async () => {
      const newFile = inputEl.files?.[0];
      if (!newFile) {
        return;
      }
      setSaving(true);
      await notifyErrors(async () => {
        const previousFile = {...file};
        const uploadedFile = await uploadFileToGCS(newFile);
        const updated = await replaceAssetFile(asset, uploadedFile);
        setAsset(updated);
        setAltText(updated.file?.alt || '');
        props.onChanged(updated);
        await syncDocs(updated, previousFile);
      });
      setSaving(false);
    };
    inputEl.click();
    inputEl.remove();
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

  return (
    <Modal
      className="AssetBrowser__detailsModal"
      opened
      onClose={props.onClose}
      title={asset.name}
      size="lg"
      overflow="outside"
      centered
    >
      <div className="AssetBrowser__details">
        <div className="AssetBrowser__details__preview">
          {isImage ? (
            <img
              src={getAssetPreviewUrl(file, 800)}
              alt={file.alt || ''}
              style={file.canvasBgColor === 'dark' ? {background: '#000'} : {}}
            />
          ) : isVideo ? (
            <video src={file.src} controls muted preload="metadata" />
          ) : (
            <div className="AssetBrowser__details__preview__placeholder">
              <IconFile size={48} stroke="1" />
              <div>{filename}</div>
            </div>
          )}
        </div>

        <Table verticalSpacing="xs" fontSize="xs">
          <tbody>
            <tr>
              <td>
                <b>Filename</b>
              </td>
              <td>{filename}</td>
            </tr>
            {Boolean(file.width && file.height) && (
              <tr>
                <td>
                  <b>Dimensions</b>
                </td>
                <td>
                  {file.width}x{file.height}
                </td>
              </tr>
            )}
            {asset.createdAt && (
              <tr>
                <td>
                  <b>Uploaded</b>
                </td>
                <td>
                  {formatDateTime(asset.createdAt)}
                  {asset.createdBy && <> by {asset.createdBy}</>}
                </td>
              </tr>
            )}
            {asset.modifiedAt && (
              <tr>
                <td>
                  <b>Modified</b>
                </td>
                <td>
                  {formatDateTime(asset.modifiedAt)}
                  {asset.modifiedBy && <> by {asset.modifiedBy}</>}
                </td>
              </tr>
            )}
            <tr>
              <td>
                <b>URL</b>
              </td>
              <td>
                <div className="AssetBrowser__details__url">
                  <TextInput
                    readOnly
                    value={file.src || ''}
                    size="xs"
                    radius="xs"
                    onClick={(e: Event) =>
                      (e.target as HTMLInputElement).select()
                    }
                    styles={{root: {flex: 1, minWidth: 0}}}
                  />
                  <Tooltip label="Copy URL" transition="pop">
                    <ActionIcon size="sm" onClick={() => copyAssetUrl(file)}>
                      <IconCopy size={16} />
                    </ActionIcon>
                  </Tooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </Table>

        {(isImage || isVideo) && (
          <div className="AssetBrowser__details__alt">
            <Textarea
              label="Alt text"
              description="Used as the default alt text when the asset is selected in a doc. Updating it syncs docs that use this asset."
              autosize
              minRows={1}
              size="xs"
              value={altText}
              disabled={!props.canManage || saving}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setAltText(e.currentTarget.value)
              }
            />
            {props.canManage && altDirty && (
              <Button
                size="xs"
                color="dark"
                mt={8}
                loading={saving}
                onClick={() => onSaveAltText()}
              >
                Save alt text
              </Button>
            )}
          </div>
        )}

        <div className="AssetBrowser__details__usage">
          <div className="AssetBrowser__details__usage__title">Used in</div>
          {usageDocs === null ? (
            <Loader color="gray" size="sm" />
          ) : usageDocs.length === 0 ? (
            <div className="AssetBrowser__details__usage__empty">
              No docs use this asset. NOTE: docs that haven't been saved since
              this asset was selected may not appear here.
            </div>
          ) : (
            <div className="AssetBrowser__details__usage__list">
              {usageDocs.map((cmsDoc) => (
                <a
                  key={cmsDoc.id}
                  className="AssetBrowser__details__usage__doc"
                  href={`/cms/content/${cmsDoc.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{cmsDoc.id}</span>
                  <IconExternalLink size={14} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="AssetBrowser__details__buttons">
          <Button
            variant="default"
            size="xs"
            leftIcon={<IconDownload size={14} />}
            onClick={() => downloadAssetFile(file)}
          >
            Download
          </Button>
          {props.canManage && (
            <>
              <Button
                variant="default"
                size="xs"
                leftIcon={<IconFileUpload size={14} />}
                loading={saving}
                onClick={() => onReplaceFile()}
              >
                Replace file
              </Button>
              <Button
                className="AssetBrowser__details__buttons__delete"
                color="red"
                variant="filled"
                size="xs"
                leftIcon={<IconTrash size={14} />}
                disabled={saving}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
        {confirmingDelete && (
          <div className="AssetBrowser__details__confirmDelete">
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
            <div className="AssetBrowser__details__confirmDelete__buttons">
              <Button
                variant="default"
                size="xs"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                color="red"
                size="xs"
                loading={saving}
                onClick={() => onDelete()}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
