import './FileField.css';

import {
  IconAlertTriangle,
  IconCopy,
  IconCrop,
  IconDotsVertical,
  IconDownload,
  IconExternalLink,
  IconFileUpload,
  IconInfoCircle,
  IconLibraryPhoto,
  IconPaperclip,
  IconPhotoStar,
  IconPhotoUp,
  IconRobot,
  IconSquareCheck,
  IconSquareCheckFilled,
  IconTrash,
  IconUnlink,
} from '@tabler/icons-preact';
import {ComponentChildren, createContext} from 'preact';
import {CSSProperties, forwardRef} from 'preact/compat';
import {lazy, Suspense} from 'preact/compat';
import {useContext, useMemo, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../../../core/schema.js';
import {
  AspectRatio,
  COMMON_ASPECT_RATIOS,
  formatAspectRatio,
  formatDimensionsAspectRatio,
  normalizeAspectRatios,
  testAnyAspectRatioMatches,
} from '../../../../../../shared/aspect-ratio.js';
import {
  buildDownloadURL,
  checkFileExists,
  getFileExt,
  testIsGoogleCloudImageFile,
  testIsImageFile,
  testIsVideoFile,
  UploadedFile,
  uploadFileToGCS,
  deleteFileFromGCS,
} from '../../../../../integrations/gcs.js';
import {
  downloadFromDrive,
  parseGoogleDriveId,
} from '../../../../../integrations/gdrive.js';
import {useGapiClient} from '../../../../../integrations/useGapiClient.js';
import {Button} from '../../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../../primitives/Checkbox/Checkbox.js';
import {Dialog} from '../../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../../primitives/IconButton/IconButton.js';
import {LoadingOverlay} from '../../../../../primitives/LoadingOverlay/LoadingOverlay.js';
import {
  Menu,
  MenuDivider,
  MenuGroup,
  MenuItem,
} from '../../../../../primitives/Menu/Menu.js';
import {Select} from '../../../../../primitives/Select/Select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '../../../../../primitives/Table/Table.js';
import {Textarea} from '../../../../../primitives/Textarea/Textarea.js';
import {
  hideNotification,
  showNotification,
} from '../../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../../utils/classes.js';
import {testAiEnabled, testAiImageEditingEnabled} from '../../../../ai/ai.js';
import {
  buildAssetFieldValue,
  resolveAssetPickerFolder,
} from '../../../../assets/assets.js';
import {useAssetPickerModal} from '../../../../assets/components/AssetPickerModal/AssetPickerModal.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';
import {GenerateImageForm} from './GenerateImageForm.js';

/** Mimetypes accepted by the image input field. */
const IMAGE_MIMETYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
];

type FileFieldVariant = 'file' | 'image';

export type FileFieldLoadingState = 'loading' | 'complete' | 'error';

type FileFieldProps = FieldProps & {
  variant?: FileFieldVariant;
  allowEditing?: boolean;
};

export type FileFieldValueType = UploadedFile | null;

interface FileFieldContextValue {
  field: schema.FileField;
  value: FileFieldValueType;
  setValue: (value: FileFieldValueType) => void;
  loadingState: FileFieldLoadingState | null;
  variant?: FileFieldVariant;
  /** Accepted file types. If empty, accepts all file types. */
  acceptedFileTypes: string[];
  focusDropZone: () => void;
  handleFile: (file: File | string, options?: {as?: 'svg'}) => void;
  removeFile: () => void;
  requestFileUpload: () => void;
  requestFileDownload: () => void;
  requestGenerateAltText: () => void;
  requestPlaceholderModalOpen: () => void;
  requestImageEditorOpen: () => void;
  requestAiImageEditorOpen: () => void;
  /** Whether the asset picker is available (requires a ModalsProvider). */
  assetPickerEnabled: boolean;
  requestAssetPicker: () => void;
  unlinkAsset: () => void;
  showAltText: boolean;
  altText: string;
  setAltText: (altText: string) => void;
  altDisabledByMetadata: boolean;
  setAltDisabledByMetadata?: (disabled: boolean) => void;
  allowEditing: boolean;
  /** Recommended aspect ratios from the field's schema. */
  aspectRatios: AspectRatio[];
  /** Whether the user dismissed the aspect ratio warning. */
  aspectRatioWarningIgnored: boolean;
  setAspectRatioWarningIgnored?: (ignored: boolean) => void;
}

const FileFieldContext = createContext<FileFieldContextValue | null>(null);

const ImageEditorDialog = lazy(() =>
  import('./ImageEditorDialog.js').then((m) => ({default: m.ImageEditorDialog}))
);

const AiImageEditorDialog = lazy(() =>
  import('./AiImageEditorDialog.js').then((m) => ({
    default: m.AiImageEditorDialog,
  }))
);

function useFileField() {
  const ctx = useContext(FileFieldContext);
  if (!ctx) {
    throw new Error(
      'useFileField() should be called within a <FileFieldContext.Provider>'
    );
  }
  return ctx;
}

export interface FileFieldInternalProps {
  field: schema.FileField;
  variant?: FileFieldVariant;
  value: FileFieldValueType;
  setValue: (value: FileFieldValueType) => void;
  loadingState: FileFieldLoadingState | null;
  setLoadingState: (state: FileFieldLoadingState | null) => void;
  showNamingOptions?: boolean;
  accept?: string[];
  allowEditing?: boolean;
  /** Whether the alt text field is disabled via per-field metadata. */
  altDisabledByMetadata?: boolean;
  /**
   * Setter for the per-field `alt` metadata. When provided, the menu shows a
   * toggle to disable the alt text input on a per-instance basis.
   */
  setAltDisabledByMetadata?: (disabled: boolean) => void;
  /**
   * Whether the aspect ratio warning was dismissed via per-field metadata
   * (`ignoreAspectRatioWarning`).
   */
  aspectRatioWarningIgnored?: boolean;
  /**
   * Setter for the per-field `ignoreAspectRatioWarning` metadata. When
   * provided, users can dismiss the aspect ratio warning.
   */
  setAspectRatioWarningIgnored?: (ignored: boolean) => void;
}

export function FileFieldInternal(props: FileFieldInternalProps) {
  const {field, value, setValue, loadingState, setLoadingState} = props;
  const dropZoneRef = useRef<HTMLButtonElement>(null);
  const [placeholderModalOpened, setPlaceholderModalOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [imageEditorOpened, setImageEditorOpened] = useState(false);
  const [aiImageEditorOpened, setAiImageEditorOpened] = useState(false);
  const gapiClient = useGapiClient();
  const assetPickerModal = useAssetPickerModal();
  const allowEditing = props.allowEditing !== false;

  // The naming mode configured by the schema. Fields that set
  // `preserveFilename: true` upload to `{hash}/{filename}.{ext}` so that the
  // original filename is kept in the serving URL without risking collisions.
  const defaultNamingMode = field.preserveFilename ? 'hash-path' : 'hash';

  // New state from FileUploader
  const [namingMode, setNamingMode] = useState<'hash' | 'hash-path' | 'clean'>(
    defaultNamingMode
  );
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);

  const aspectRatios = useMemo(
    () => normalizeAspectRatios(field.aspectRatio),
    [field.aspectRatio]
  );

  const acceptedFileTypes =
    props.accept ??
    field.exts ??
    (props.variant === 'image' ? IMAGE_MIMETYPES : []);

  const altText = value?.alt || '';
  const altDisabledByMetadata = props.altDisabledByMetadata === true;
  // Alt text can be disabled per field (schema), per instance (metadata) or
  // per asset (asset library).
  const altDisabledByAsset = value?.altDisabled === true;
  const showAltText =
    field.alt !== false && !altDisabledByMetadata && !altDisabledByAsset;

  async function uploadFile(
    file: File,
    originalSrc?: string,
    options?: {
      namingMode?: 'hash' | 'hash-path' | 'clean';
      checkExists?: boolean;
    }
  ) {
    try {
      setLoadingState('loading');
      // Use the requested namingMode if available, otherwise fall back to the
      // field config.
      const mode = options?.namingMode || defaultNamingMode;

      // When using the original filename without a hash, the file can be
      // overwritten by a subsequent upload, so disable caching.
      const cacheControl =
        field.cacheControl || (mode === 'clean' ? 'no-cache' : undefined);

      const uploadedFile = await uploadFileToGCS(file, {
        namingMode: mode,
        checkExists: options?.checkExists ?? false,
        cacheControl,
      });

      // Preserve previous alt text when a new file is uploaded.
      if (
        !uploadedFile.alt &&
        testShouldHaveAltText(uploadedFile.filename) &&
        altText
      ) {
        uploadedFile.alt = altText;
      }
      if (originalSrc) {
        uploadedFile.originalSrc = originalSrc;
      }
      setValue(uploadedFile);
      setLoadingState('complete');
      setPendingUpload(null);
      setExistingFileUrl(null);
    } catch (err) {
      console.error('upload failed');
      console.error(err);
      setLoadingState('error');
      showNotification({
        title: 'Upload failed',
        message: 'Failed to upload: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }
  }

  async function handleRemoveFileConfirm() {
    setLoadingState('loading');
    try {
      const gcsPath = value?.gcsPath || value?.src;
      if (gcsPath) {
        await deleteFileFromGCS(gcsPath);
      }
      setValue(null);
      setLoadingState(null);
      showNotification({
        message: 'File deleted from GCS',
        color: 'green',
      });
    } catch (err) {
      console.error(err);
      setLoadingState('error');
      showNotification({
        title: 'Delete failed',
        message: String(err),
        color: 'red',
      });
    } finally {
      setDeleteModalOpened(false);
    }
  }

  function removeFile() {
    if (!allowEditing && value?.src) {
      // In standalone uploader mode (allowEditing=false), "remove" means
      // delete from GCS.
      setDeleteModalOpened(true);
      return;
    }
    setValue(null);
  }

  async function handleFile(file: File | string, options?: {as?: 'svg'}) {
    if (!file) {
      return;
    }

    setPendingUpload(null);
    setExistingFileUrl(null);
    setOverwriteConfirmed(false);

    if (typeof file === 'string' && !options?.as) {
      // Handle Google Drive URLs.
      const driveId = parseGoogleDriveId(file);
      if (driveId) {
        try {
          if (!gapiClient.enabled) {
            console.warn(
              'Google API integration is not enabled for this project. Specify the `gapi` config in your root.config.ts to enable pasting from Google Drive URLs.'
            );
            return;
          }

          setLoadingState('loading');
          showNotification({
            message: 'Downloading from Google Drive...',
            loading: true,
            autoClose: false,
            id: 'gdrive-download',
          });
          const downloadedFile = await downloadFromDrive(gapiClient, driveId);
          hideNotification('gdrive-download');
          handleFile(downloadedFile);
        } catch (err: any) {
          console.error(err);
          setLoadingState('error');
          hideNotification('gdrive-download');
          showNotification({
            title: 'Google Drive import failed',
            message: err.message || 'Failed to download',
            color: 'red',
          });
        }
        return;
      }
    }

    // Convert text to a File.
    if (options?.as === 'svg' && typeof file === 'string') {
      file = new File(
        [new Blob([file], {type: 'image/svg+xml'})],
        'untitled.svg',
        {
          type: 'image/svg+xml',
        }
      );
    }

    const fileObj = file as File;
    const ext = getFileExt(fileObj.name);

    // Validation
    if (
      acceptedFileTypes.length > 0 &&
      !acceptedFileTypes.some(
        (type) =>
          type.endsWith(ext) ||
          type === `*/${ext}` ||
          type === '*/*' ||
          type === fileObj.type
      )
    ) {
      showNotification({
        title: 'Invalid file type',
        message: `File type ${ext} is not allowed.`,
        color: 'red',
        autoClose: true,
      });
      return;
    }

    // Check for overwrite if clean naming mode is active
    if (namingMode === 'clean' && props.showNamingOptions) {
      setLoadingState('loading');
      const projectId = window.__ROOT_CTX.rootConfig.projectId;
      const filePath = `${projectId}/uploads/${fileObj.name}`;
      try {
        const exists = await checkFileExists(filePath);
        if (exists) {
          setPendingUpload(fileObj);
          setExistingFileUrl(
            `https://storage.googleapis.com/${window.firebase.storage.app.options.storageBucket}/${filePath}`
          );
          setLoadingState(null); // Stop loading to show UI
          return;
        }
      } catch (err) {
        console.warn('Failed to check file existence', err);
      }
    }

    uploadFile(fileObj, undefined, {namingMode: namingMode});
  }

  function focusDropZone() {
    dropZoneRef.current?.focus();
  }

  function requestFileDownload() {
    if (!value?.src) {
      return;
    }
    if (testIsGoogleCloudImageFile(value.src)) {
      const link = document.createElement('a');
      link.href = buildDownloadURL(value.src);
      if (value.filename) {
        link.download = value.filename;
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      window.open(value.src, '_blank');
    }
  }

  function requestFileUpload() {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    if (acceptedFileTypes.length > 0) {
      inputEl.accept = acceptedFileTypes.join(',');
    }
    inputEl.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        handleFile(target.files[0]);
      }
    };
    inputEl.click();
    inputEl.remove();
  }

  function requestPlaceholderModalOpen() {
    setPlaceholderModalOpened(true);
  }

  function requestImageEditorOpen() {
    setImageEditorOpened(true);
  }

  function requestAiImageEditorOpen() {
    setAiImageEditorOpened(true);
  }

  /**
   * Opens the asset picker modal for selecting a file from the asset library.
   * The selected asset's file data is copied into the doc along with an
   * `assetId` backlink so updates to the asset can be synced to the doc.
   *
   * The picker opens in the last folder visited during this tab session. For
   * new tab sessions it falls back to the folder of the currently-linked
   * asset (when replacing a value backed by `assetId`), or the project root.
   */
  async function requestAssetPicker() {
    const initialFolder = await resolveAssetPickerFolder(value?.assetId);
    assetPickerModal.open({
      accept: acceptedFileTypes,
      initialFolder,
      onSelect: (asset) => {
        const newValue = buildAssetFieldValue(asset);
        // Preserve previous alt text when the asset doesn't define one.
        if (!newValue.alt && altText) {
          newValue.alt = altText;
        }
        setValue(newValue);
        setLoadingState('complete');
      },
    });
  }

  /**
   * Removes the `assetId` backlink from the field value, keeping the file
   * data. The doc will no longer receive updates when the asset changes.
   */
  function unlinkAsset() {
    if (!value?.assetId) {
      return;
    }
    const newValue = {...value};
    delete newValue.assetId;
    setValue(newValue);
  }

  function setAltText(newAltText: string) {
    if (!value?.src) {
      return;
    }
    setValue({...value, alt: newAltText || ''});
  }

  async function requestGenerateAltText() {
    const uploadedFile = value;
    if (!uploadedFile?.src) {
      return;
    }
    setLoadingState('loading');
    try {
      const res = await window.fetch('/cms/api/ai.generate_alt_text', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({imageUrl: uploadedFile.src}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate alt text');
      }
      if (data.altText) {
        setAltText(data.altText);
      }
    } catch (err: any) {
      showNotification({
        title: 'Sorry, something went wrong.',
        message: err.message || 'Unknown error',
        color: 'red',
        autoClose: true,
      });
    } finally {
      setLoadingState('complete');
    }
  }

  return (
    <FileFieldContext.Provider
      value={{
        field: field,
        variant: props.variant,
        value: value,
        setValue: setValue,
        loadingState: loadingState,
        removeFile: removeFile,
        acceptedFileTypes: acceptedFileTypes,
        handleFile: handleFile,
        focusDropZone: focusDropZone,
        requestGenerateAltText: requestGenerateAltText,
        requestFileUpload: requestFileUpload,
        requestFileDownload: requestFileDownload,
        requestPlaceholderModalOpen: requestPlaceholderModalOpen,
        requestImageEditorOpen: requestImageEditorOpen,
        requestAiImageEditorOpen: requestAiImageEditorOpen,
        assetPickerEnabled: assetPickerModal.enabled,
        requestAssetPicker: requestAssetPicker,
        unlinkAsset: unlinkAsset,
        showAltText: showAltText,
        altText: altText,
        setAltText: setAltText,
        altDisabledByMetadata: altDisabledByMetadata,
        setAltDisabledByMetadata: props.setAltDisabledByMetadata,
        allowEditing: allowEditing,
        aspectRatios: aspectRatios,
        aspectRatioWarningIgnored: props.aspectRatioWarningIgnored === true,
        setAspectRatioWarningIgnored: props.setAspectRatioWarningIgnored,
      }}
    >
      <Dialog
        className="FileField__placeholderDialog"
        size="sm"
        open={placeholderModalOpened}
        onClose={() => setPlaceholderModalOpened(false)}
        title="Placeholder image"
        centered
      >
        <GenerateImageForm
          onSubmit={(file) => {
            setValue(file);
            setPlaceholderModalOpened(false);
          }}
        />
      </Dialog>
      <Dialog
        className="FileField__deleteDialog"
        size="sm"
        open={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Delete file?"
        centered
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              size="md"
              onClick={() => setDeleteModalOpened(false)}
              disabled={loadingState === 'loading'}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleRemoveFileConfirm}
              loading={loadingState === 'loading'}
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="m-0 text-base">
          Are you sure you want to delete this file from GCS? This action cannot
          be undone.
        </p>
      </Dialog>
      {imageEditorOpened && value?.src && (
        <Suspense fallback={null}>
          <ImageEditorDialog
            key={value.src}
            opened={imageEditorOpened}
            onClose={() => setImageEditorOpened(false)}
            src={value.src}
            originalSrc={value.originalSrc}
            filename={value.filename}
            aspectRatios={aspectRatios}
            onSave={(file) => {
              uploadFile(file, value.originalSrc || value.src);
              setImageEditorOpened(false);
            }}
          />
        </Suspense>
      )}
      {aiImageEditorOpened && value?.src && (
        <Suspense fallback={null}>
          <AiImageEditorDialog
            key={value.src}
            opened={aiImageEditorOpened}
            onClose={() => setAiImageEditorOpened(false)}
            src={value.src}
            filename={value.filename}
            onSave={(file) => {
              uploadFile(file, value.originalSrc || value.src);
              setAiImageEditorOpened(false);
            }}
          />
        </Suspense>
      )}

      {/* Pending Upload Warning */}
      {pendingUpload ? (
        <div className="FileField__overwriteWarning flex flex-col gap-3 rounded-sm border border-solid border-input-border bg-surface-subtle p-3 text-base">
          <div className="FileField__overwriteWarning__header flex items-center justify-between font-bold text-danger">
            File already exists
          </div>
          <div>
            A file named <strong>{pendingUpload.name}</strong> already exists.
          </div>
          {existingFileUrl && (
            <div className="FileField__overwriteWarning__link">
              <a
                className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-inherit underline"
                href={existingFileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View existing file <IconExternalLink size={12} />
              </a>
            </div>
          )}

          <div className="FileField__overwriteWarning__checkbox mt-1">
            <Checkbox
              color="blue"
              size="md"
              label="Confirm overwrite"
              checked={overwriteConfirmed}
              onChange={(e) => setOverwriteConfirmed(e.currentTarget.checked)}
            />
          </div>

          <div className="FileField__overwriteWarning__actions mt-1 grid grid-cols-2 gap-2">
            <Button
              size="md"
              onClick={() => {
                setPendingUpload(null);
                setExistingFileUrl(null);
                setOverwriteConfirmed(false);
              }}
              disabled={loadingState === 'loading'}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={!overwriteConfirmed}
              onClick={() =>
                uploadFile(pendingUpload, undefined, {namingMode: 'clean'})
              }
              loading={loadingState === 'loading'}
            >
              Overwrite
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            className={cn(
              'FileField relative border border-solid',
              props.showNamingOptions && 'FileField--withOptions',
              value?.src ? 'p-0' : 'p-2.5'
            )}
          >
            <FileField.Dropzone ref={dropZoneRef} />
            {value?.src ? (
              <FileField.Preview />
            ) : (
              <FileField.InvisibleDropzone>
                <FileField.Empty />
              </FileField.InvisibleDropzone>
            )}
          </div>

          {props.showNamingOptions && !value && (
            <div className="FileField__settings relative z-2 mt-2">
              <Select
                label="File name options"
                // Each option's description shows beneath its label.
                data={NAMING_MODE_OPTIONS}
                value={namingMode}
                onValueChange={(val) =>
                  setNamingMode((val as typeof namingMode) || 'hash')
                }
                disabled={loadingState === 'loading' || !!value}
              />
            </div>
          )}
        </>
      )}
    </FileFieldContext.Provider>
  );
}

/**
 * CMS-connected file field.
 *
 * This component is designed to be used within the CMS document editor. It
 * automatically connects to the draft doc state using `useDraftDocValue` and
 * handles reading and writing values to the document.
 */
export function FileField(props: FileFieldProps) {
  const field = props.field as schema.FileField;
  const [value, setValue] = useDraftDocValue<FileFieldValueType>(props.deepKey);
  const [loadingState, setLoadingState] =
    useState<FileFieldLoadingState | null>(null);

  const metadataKey = getMetadataKey(props.deepKey);
  const [metadata, setMetadata] = useDraftDocValue<Record<string, any> | null>(
    metadataKey
  );
  const altDisabledByMetadata = metadata?.alt === false;
  const updateMetadata = (key: string, fieldValue: any) => {
    const next = {...(metadata || {})};
    if (fieldValue === undefined) {
      delete next[key];
    } else {
      next[key] = fieldValue;
    }
    setMetadata(Object.keys(next).length === 0 ? null : next);
  };
  const setAltDisabledByMetadata = (disabled: boolean) => {
    updateMetadata('alt', disabled ? false : undefined);
  };

  const aspectRatioWarningIgnored = metadata?.ignoreAspectRatioWarning === true;
  const setAspectRatioWarningIgnored = (ignored: boolean) => {
    updateMetadata('ignoreAspectRatioWarning', ignored ? true : undefined);
  };

  const setValueAndResetWarning = (newValue: FileFieldValueType) => {
    // A dismissed aspect ratio warning only applies to the file that was
    // dismissed, so reset it when the file changes.
    if (aspectRatioWarningIgnored && newValue?.src !== value?.src) {
      setAspectRatioWarningIgnored(false);
    }
    setValue(newValue);
  };

  return (
    <FileFieldInternal
      field={field}
      value={value}
      setValue={setValueAndResetWarning}
      loadingState={loadingState}
      setLoadingState={setLoadingState}
      variant={props.variant}
      allowEditing={props.allowEditing}
      altDisabledByMetadata={altDisabledByMetadata}
      setAltDisabledByMetadata={
        props.variant === 'image' && field.alt !== false
          ? setAltDisabledByMetadata
          : undefined
      }
      aspectRatioWarningIgnored={aspectRatioWarningIgnored}
      setAspectRatioWarningIgnored={setAspectRatioWarningIgnored}
    />
  );
}

FileField.Preview = () => {
  const ctx = useFileField();
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const aiEnabled = testAiEnabled();
  const aiImageEditingEnabled = testAiImageEditingEnabled();

  // Videos and images are the only files that get the canvas preview.
  // Other types just show the info panel. Videos with zero dimensions
  // (e.g. missing metadata) are treated as non-previewable.
  const hasValidDimensions =
    !!ctx.value?.width &&
    !!ctx.value?.height &&
    Number(ctx.value.width) > 0 &&
    Number(ctx.value.height) > 0;
  const filename = ctx.value?.filename || '';
  const isVideo = testIsVideoFile(filename);
  // GCI-served images (`https://lh3...`) are always previewable, even when
  // the filename has no image extension.
  const supportsCanvasPreview =
    testIsImageFile(filename) ||
    testIsGoogleCloudImageFile(ctx.value?.src || '') ||
    (isVideo && hasValidDimensions);
  const [infoOpened, setInfoOpened] = useState(!supportsCanvasPreview);

  // Keep infoOpened in sync when the file type changes (e.g. uploading a PDF
  // after an MP4). Without this, the state would be stale from the first file.
  const prevFileSrcRef = useRef(ctx.value?.src);
  if (ctx.value?.src !== prevFileSrcRef.current) {
    prevFileSrcRef.current = ctx.value?.src;
    const newFilename = ctx.value?.filename || '';
    const newSupportsCanvas =
      testIsImageFile(newFilename) ||
      testIsGoogleCloudImageFile(ctx.value?.src || '') ||
      (testIsVideoFile(newFilename) && hasValidDimensions);
    if (!newSupportsCanvas && !infoOpened) {
      setInfoOpened(true);
    } else if (newSupportsCanvas && infoOpened) {
      setInfoOpened(false);
    }
  }

  if (!ctx.value?.src) {
    return null;
  }

  const showsVideo = !infoOpened && testIsVideoFile(ctx.value.src);
  const canvasStyle = canvasPreviewInlineStyles(ctx.value, infoOpened);
  if (showsVideo && !canvasStyle.backgroundColor) {
    // Videos letterbox on black.
    canvasStyle.backgroundColor = '#000';
  }
  if (dragging) {
    // Let the dragging tint from `FileField.css` show.
    delete canvasStyle.backgroundColor;
  }
  const hasAssetBadge = Boolean(ctx.value.assetId);

  return (
    <div className="FileField__Preview pointer-events-none relative z-1">
      <div className="FileField__Preview__InfoButton pointer-events-auto absolute right-1.5 top-1.5 z-2 flex gap-1">
        {supportsCanvasPreview && (
          <IconButton
            className="FileField__Preview__InfoButton__Icon"
            variant="default"
            size="xs"
            label="Toggle file info"
            pressed={infoOpened}
            onClick={() => setInfoOpened((o) => !o)}
          >
            <IconInfoCircle />
          </IconButton>
        )}
        <Menu
          className="FileField__Preview__Menu"
          placement="bottom-end"
          width={230}
          trigger={
            <IconButton
              className="FileField__Preview__InfoButton__Icon"
              variant="default"
              size="xs"
              label="File options"
            >
              <IconDotsVertical />
            </IconButton>
          }
        >
          {ctx.allowEditing && (
            <>
              <MenuGroup label="REPLACE">
                <MenuItem
                  icon={
                    ctx.variant === 'image' ? (
                      <IconPhotoUp />
                    ) : (
                      <IconFileUpload />
                    )
                  }
                  onClick={() => ctx.requestFileUpload()}
                >
                  Upload {ctx.variant === 'image' ? 'image' : 'file'}
                </MenuItem>
                {ctx.assetPickerEnabled && (
                  <MenuItem
                    icon={<IconLibraryPhoto />}
                    onClick={() => ctx.requestAssetPicker()}
                  >
                    Select from asset library
                  </MenuItem>
                )}
                {testSupportsCreatePlaceholder(ctx.acceptedFileTypes) && (
                  <MenuItem
                    disabled={!ctx.value?.src}
                    icon={<IconPhotoStar />}
                    onClick={() => {
                      ctx.requestPlaceholderModalOpen();
                    }}
                  >
                    Placeholder image
                  </MenuItem>
                )}
                {testIsImageFile(ctx.value?.src) &&
                  !ctx.value?.src?.endsWith('.svg') && (
                    <>
                      <MenuItem
                        disabled={!ctx.value?.src}
                        icon={<IconCrop />}
                        onClick={() => {
                          ctx.requestImageEditorOpen();
                        }}
                      >
                        Edit image
                      </MenuItem>
                      {aiImageEditingEnabled && (
                        <MenuItem
                          disabled={!ctx.value?.src}
                          icon={<IconRobot />}
                          onClick={() => {
                            ctx.requestAiImageEditorOpen();
                          }}
                        >
                          Edit with AI
                        </MenuItem>
                      )}
                    </>
                  )}
              </MenuGroup>
              <MenuDivider />
            </>
          )}
          <MenuItem
            disabled={ctx.value?.src?.startsWith('data:')}
            onClick={() => {
              ctx?.requestFileDownload();
            }}
            icon={<IconDownload />}
          >
            Download file
          </MenuItem>
          <MenuItem
            closeOnClick={false}
            icon={<IconCopy />}
            onClick={() => {
              setCopied(false);
              let url = ctx.value?.src || '';
              if (testIsGoogleCloudImageFile(url)) {
                url = url.split('=')[0] + '=s0';
              }
              navigator.clipboard
                .writeText(url)
                .then(() => setCopied(true))
                .finally(() =>
                  setTimeout(() => {
                    setCopied(false);
                  }, 2000)
                );
            }}
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </MenuItem>
          {ctx.value?.assetId && (
            <MenuItem
              href={`/cms/assets?asset=${ctx.value.assetId}`}
              target="_blank"
              rel="noreferrer"
              icon={<IconExternalLink />}
            >
              View in asset library
            </MenuItem>
          )}
          {ctx.allowEditing && ctx.value?.assetId && (
            <MenuItem icon={<IconUnlink />} onClick={() => ctx.unlinkAsset()}>
              Unlink from asset library
            </MenuItem>
          )}
          {ctx.allowEditing &&
            testIsImageFile(ctx.value?.src || '') &&
            ctx.value?.canvasBgColor && (
              <MenuItem
                role="menuitemcheckbox"
                aria-checked={ctx.value?.canvasBgColor === 'dark'}
                icon={
                  <CheckIcon checked={ctx.value?.canvasBgColor === 'dark'} />
                }
                closeOnClick={false}
                onClick={() => {
                  const newColor =
                    ctx.value?.canvasBgColor === 'dark' ? 'light' : 'dark';
                  if (ctx.value) {
                    ctx.setValue({...ctx.value, canvasBgColor: newColor});
                  }
                }}
              >
                Use dark canvas
              </MenuItem>
            )}
          {ctx.allowEditing &&
            ctx.setAspectRatioWarningIgnored &&
            testAspectRatioMismatch(ctx.value, ctx.aspectRatios) && (
              <MenuItem
                role="menuitemcheckbox"
                aria-checked={ctx.aspectRatioWarningIgnored}
                icon={<CheckIcon checked={ctx.aspectRatioWarningIgnored} />}
                closeOnClick={false}
                onClick={() => {
                  ctx.setAspectRatioWarningIgnored?.(
                    !ctx.aspectRatioWarningIgnored
                  );
                }}
              >
                Ignore aspect ratio warning
              </MenuItem>
            )}
          {ctx.allowEditing && ctx.setAltDisabledByMetadata && (
            <MenuItem
              role="menuitemcheckbox"
              aria-checked={ctx.altDisabledByMetadata}
              icon={<CheckIcon checked={ctx.altDisabledByMetadata} />}
              closeOnClick={false}
              onClick={() => {
                ctx.setAltDisabledByMetadata?.(!ctx.altDisabledByMetadata);
              }}
            >
              Disable alt text
            </MenuItem>
          )}
          <MenuDivider />
          <MenuItem
            danger
            onClick={() => {
              ctx?.removeFile();
            }}
            icon={<IconTrash />}
          >
            Remove file
          </MenuItem>
        </Menu>
      </div>

      <div
        className={cn(
          'FileField__Canvas relative min-h-20 w-full',
          infoOpened && 'FileField__Canvas--infoOpened',
          dragging && 'FileField__Canvas--dragging'
        )}
        style={canvasStyle}
        onDragOver={(e) => {
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
          const file = e.dataTransfer?.files[0];
          if (file && ctx) {
            ctx.handleFile(file);
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          // Handle Files.
          const file = e.clipboardData?.files[0];
          if (file) {
            ctx.handleFile(file);
            return;
          }
          // Handle SVG text (supports copying SVG from Figma) or Drive URLs.
          const text = e.clipboardData?.getData('text/plain');
          if (text) {
            if (parseGoogleDriveId(text)) {
              ctx.handleFile(text);
              return;
            }
            if (testSvg(text)) {
              ctx.handleFile(text, {as: 'svg'});
              return;
            }
          }
        }}
      >
        <LoadingOverlay visible={ctx.loadingState === 'loading'} />
        {infoOpened ? (
          <div className="FileField__Canvas__Info pointer-events-auto h-full overflow-auto px-2.5 pb-2.5 pt-10">
            <IconPaperclip
              size={16}
              className="FileField__Canvas__Info__Icon absolute left-2.5 top-3"
            />
            <Table
              className="FileField__Canvas__Info__Table"
              classNames={{table: 'table-fixed'}}
              withColumnBorders
            >
              <TableBody>
                {ctx.value?.filename && (
                  <InfoRow label="Name">
                    <span className="wrap-anywhere">{ctx.value.filename}</span>
                  </InfoRow>
                )}
                {ctx.value?.assetId && (
                  <InfoRow label="Asset">
                    <a
                      className="text-inherit"
                      href={`/cms/assets?asset=${ctx.value.assetId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in asset library
                    </a>
                  </InfoRow>
                )}
                {ctx.value?.uploadedAt && (
                  <InfoRow label="Uploaded">
                    {new Date(
                      parseInt(ctx.value.uploadedAt as string, 10)
                    ).toLocaleString()}
                    {ctx.value.uploadedBy && (
                      <span className="wrap-anywhere">
                        {' '}
                        by {ctx.value.uploadedBy}
                      </span>
                    )}
                  </InfoRow>
                )}
                {Boolean(ctx.value?.width && ctx.value?.height) && (
                  <InfoRow label="Dimensions">
                    {ctx.value!.width}x{ctx.value!.height}
                  </InfoRow>
                )}
                <InfoRow label="URL">
                  <Textarea
                    aria-label="URL"
                    readOnly
                    value={ctx.value?.src}
                    size="xs"
                    classNames={{input: 'rounded-none'}}
                    autosize
                    minRows={1}
                    maxRows={10}
                  />
                </InfoRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            {Boolean(ctx.value?.width && ctx.value?.height) && (
              <div
                className={cn(
                  'FileField__Preview__Info pointer-events-auto absolute left-1.5 z-1 rounded-sm bg-strong px-1.5 py-0.5 text-2xs font-bold leading-tight text-inverse',
                  // Below the asset library badge, when there is one.
                  hasAssetBadge ? 'bottom-1.5' : 'top-1.5'
                )}
              >
                {ctx.value!.width}x{ctx.value!.height}
              </div>
            )}
            {hasAssetBadge && (
              <a
                className="FileField__Preview__AssetLibraryBadge pointer-events-auto absolute left-1.5 top-1.5 z-1 block rounded-sm bg-info px-1.5 py-0.5 text-2xs font-bold leading-tight text-inverse no-underline active:translate-y-px"
                href={`/cms/assets?asset=${ctx.value?.assetId}`}
                target="_blank"
              >
                ASSET LIBRARY
              </a>
            )}
            {testIsImageFile(ctx.value?.src) && (
              <img
                onClick={() => {
                  ctx?.focusDropZone();
                }}
                onDblClick={() => {
                  if (ctx.allowEditing) {
                    ctx?.requestFileUpload();
                  }
                }}
                src={ctx.value.src}
                alt={ctx.value.alt || 'Uploaded file preview'}
                className="FileField__Preview__Image pointer-events-auto mx-auto block h-full max-w-full object-contain object-center"
                style={previewInlineStyles(ctx.value)}
              />
            )}
            {showsVideo && (
              <video
                className="FileField__Preview__Image pointer-events-auto mx-auto block h-full max-w-full object-contain object-center"
                style={previewInlineStyles(ctx.value)}
                controls
                muted
                preload="metadata"
              >
                <source
                  src={ctx.value.src}
                  type={`video/${getFileExt(ctx.value.src)}`}
                />
              </video>
            )}
          </>
        )}
        {ctx.allowEditing && !infoOpened && (
          <div className="FileField__reupload pointer-events-auto absolute bottom-1.5 right-1.5 z-1">
            <FileField.UploadButton
              className="FileField__reupload__button"
              compact
            />
          </div>
        )}
      </div>
      <FileField.AspectRatioWarning />
      {ctx.allowEditing &&
        ctx.showAltText &&
        (ctx.altText ||
          testShouldHaveAltText(ctx.value?.filename) ||
          ctx.variant === 'image') && (
          <div className="DocEditor__ImageField__imagePreview__Image__Alt flex items-center gap-2 border-0 border-t border-solid border-input-border p-2">
            <Textarea
              className="DocEditor__ImageField__imagePreview__Image__Alt__Textarea pointer-events-auto min-w-0 flex-1"
              classNames={{input: 'rounded-none'}}
              aria-label="Alt text"
              value={ctx.altText}
              placeholder="Alt text"
              autosize
              minRows={1}
              disabled={ctx.loadingState === 'loading'}
              onInput={(e) => {
                ctx?.setAltText(e.currentTarget.value);
              }}
            />
            {aiEnabled &&
              !ctx.altText &&
              ctx.value?.src?.startsWith('http') && (
                <IconButton
                  className="DocEditor__ImageField__imagePreview__Image__Alt__AiButton pointer-events-auto relative z-2 *:size-5"
                  label="Generate alt text with AI"
                  onClick={() => {
                    ctx.requestGenerateAltText();
                  }}
                  disabled={ctx.loadingState === 'loading'}
                >
                  <IconRobot stroke="1.75" />
                </IconButton>
              )}
          </div>
        )}
    </div>
  );
};

/** A label and value row in the file info table. */
function InfoRow(props: {label: string; children: ComponentChildren}) {
  return (
    <TableRow>
      <TableCell className="w-28 font-bold">{props.label}</TableCell>
      <TableCell>{props.children}</TableCell>
    </TableRow>
  );
}

/** The check box icon of a menu item that toggles a setting. */
function CheckIcon(props: {checked: boolean}) {
  return props.checked ? (
    <IconSquareCheckFilled />
  ) : (
    <IconSquareCheck className="opacity-25" />
  );
}

/**
 * Warns the user when an uploaded image or video doesn't match the field's
 * recommended aspect ratio. The warning can be dismissed, which is stored in
 * the field's metadata.
 */
FileField.AspectRatioWarning = () => {
  const ctx = useFileField();
  const value = ctx.value;
  if (
    !value ||
    ctx.aspectRatioWarningIgnored ||
    !testAspectRatioMismatch(value, ctx.aspectRatios)
  ) {
    return null;
  }
  const width = Number(value.width);
  const height = Number(value.height);
  const isVideo =
    testIsVideoFile(value.src) || testIsVideoFile(value.filename || '');
  const canCrop =
    ctx.allowEditing &&
    testIsImageFile(value.src) &&
    !value.src.endsWith('.svg');
  const recommended = ctx.aspectRatios
    .map((ratio) => formatAspectRatio(ratio))
    .join(' or ');
  return (
    <div
      className="FileField__AspectRatioWarning pointer-events-auto flex items-start gap-2 border-0 border-t border-solid border-warning-line bg-warning-soft p-2 text-sm leading-snug text-fg"
      role="status"
    >
      <IconAlertTriangle
        size={16}
        className="FileField__AspectRatioWarning__Icon mt-px flex-none text-warning"
      />
      <div className="FileField__AspectRatioWarning__Message min-w-0 flex-1">
        This {isVideo ? 'video' : 'image'} is{' '}
        <strong>
          {formatDimensionsAspectRatio(width, height, [
            ...ctx.aspectRatios,
            ...COMMON_ASPECT_RATIOS,
          ])}
        </strong>{' '}
        ({width}x{height}). The recommended aspect ratio is{' '}
        <strong>{recommended}</strong>.
      </div>
      <div className="FileField__AspectRatioWarning__Actions flex flex-none gap-1">
        {canCrop && (
          <Button
            className="FileField__AspectRatioWarning__Button font-medium"
            size="xs"
            onClick={() => ctx.requestImageEditorOpen()}
          >
            Crop
          </Button>
        )}
        {ctx.allowEditing && ctx.setAspectRatioWarningIgnored && (
          <Button
            className="FileField__AspectRatioWarning__Button font-medium"
            size="xs"
            title="Dismiss this warning for the current file"
            onClick={() => ctx.setAspectRatioWarningIgnored?.(true)}
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
};

FileField.UploadButton = (props: {className?: string; compact?: boolean}) => {
  const ctx = useFileField();
  const loading = ctx.loadingState === 'loading';
  return (
    <Button
      size={props.compact ? 'xs' : 'sm'}
      disabled={loading}
      loading={loading && !props.compact}
      className={cn(
        'FileField__FileUploadButton',
        props.compact && 'FileField__FileUploadButton--compact',
        // The full label wraps instead of truncating in narrow fields.
        !props.compact &&
          'h-auto min-h-control-sm shrink py-1 text-center leading-tight **:whitespace-normal',
        props.className
      )}
      onClick={() => {
        ctx.requestFileUpload();
      }}
      icon={ctx?.variant === 'image' ? <IconPhotoUp /> : <IconFileUpload />}
    >
      {loading && !props.compact
        ? 'Uploading...'
        : ctx.value?.src
          ? 'Upload'
          : 'Paste, drop, or click to upload'}
    </Button>
  );
};

FileField.InvisibleDropzone = (props: {children: ComponentChildren}) => {
  const [dragging, setDragging] = useState(false);
  const ctx = useFileField();
  return (
    <div
      className={cn(
        'FileField__InvisibleDropzone contents',
        dragging && 'FileField__InvisibleDropzone--dragging'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const file = e.dataTransfer?.files[0];
        if (file) {
          ctx.handleFile(file);
        }
      }}
    >
      {props.children}
    </div>
  );
};

FileField.Empty = () => {
  const ctx = useFileField();
  const acceptsLabel = useMemo(() => {
    if (ctx.acceptedFileTypes.length === 0) {
      return '';
    }
    const visibleTypes = ctx.acceptedFileTypes.filter(
      (t) => t !== '*/*' && t !== '*'
    );
    if (visibleTypes.length === 0) {
      return '';
    }
    return visibleTypes
      .map((mimeType) =>
        mimeType.split('/').pop()!.split('+')[0].replaceAll('.', '')
      )
      .sort()
      .join(', ');
  }, [ctx.acceptedFileTypes]);
  return (
    <div className="FileField__Empty pointer-events-none relative z-2 flex flex-col items-center gap-1 pt-5 *:pointer-events-auto">
      <div className="FileField__Empty__Label flex max-w-full justify-between gap-2">
        <FileField.UploadButton className="min-w-0" />
        {testSupportsCreatePlaceholder(ctx.acceptedFileTypes) && (
          <IconButton
            className="FileField__Empty__Label__PlaceholderButton"
            label="Create placeholder image"
            onClick={() => {
              ctx.requestPlaceholderModalOpen();
            }}
          >
            <IconPhotoStar />
          </IconButton>
        )}
      </div>
      {ctx.allowEditing && ctx.assetPickerEnabled && (
        <div className="FileField__Empty__AssetLibrary relative z-2 text-sm font-medium">
          or select from{' '}
          <button
            type="button"
            className="FileField__Empty__AssetLibrary__link m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 font-sans text-sm font-medium text-fg underline underline-offset-3"
            onClick={() => ctx.requestAssetPicker()}
          >
            asset library
          </button>
        </div>
      )}
      {acceptsLabel && (
        <div>
          <div className="FileField__Empty__AcceptTypes relative z-1 mt-5 block text-xs">
            Allowed file types: {acceptsLabel}
          </div>
        </div>
      )}
    </div>
  );
};

FileField.Dropzone = forwardRef<HTMLButtonElement, {}>((props, ref) => {
  const [dragging, setDragging] = useState(false);
  const ctx = useFileField();
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Drop or paste to upload a file"
      className={cn(
        'FileField__Dropzone absolute inset-0 m-0 cursor-default appearance-none border-0 p-0 focus:outline-1 focus:outline-focus',
        dragging && 'FileField__Dropzone--dragging'
      )}
      onDblClick={() => {
        ctx?.requestFileUpload();
      }}
      onCopy={(e) => {
        if (!ctx.value?.src) {
          return;
        }
        e.preventDefault();
        e.clipboardData?.setData('text/plain', ctx.value.src);
        e.clipboardData?.setData('application/json', JSON.stringify(ctx.value));
      }}
      onKeyDown={(e) => {
        if (
          ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') ||
          e.key === 'Delete'
        ) {
          e.preventDefault();
          if (ctx.value?.src) {
            ctx.removeFile();
          }
        }
      }}
      onDragOver={(e) => {
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
        const file = e.dataTransfer?.files[0];
        if (file && ctx) {
          ctx.handleFile(file);
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        if (!ctx) {
          return;
        }
        // Handle pasting from one field to another.
        const json = e.clipboardData?.getData('application/json');
        if (json) {
          try {
            const uploadedFile = JSON.parse(json);
            if (
              uploadedFile &&
              uploadedFile.src &&
              uploadedFile.filename &&
              ctx
            ) {
              console.log('Parsed JSON file:', uploadedFile);
              ctx.setValue(uploadedFile);
              return;
            }
          } catch (err) {
            console.error('error parsing json', err);
          }
        }
        // Handle files.
        const file = e.clipboardData?.files[0];
        if (file) {
          ctx.handleFile(file);
          return;
        }
        // Handle SVG text (supports copying SVG from Figma) or Drive URLs.
        const text = e.clipboardData?.getData('text/plain');
        if (text) {
          if (parseGoogleDriveId(text)) {
            ctx.handleFile(text);
            return;
          }
          if (testSvg(text)) {
            ctx.handleFile(text, {as: 'svg'});
            return;
          }
        }
      }}
      title="Drop or paste to upload a file"
    ></button>
  );
});

/** Options for the standalone uploader's file naming select. */
const NAMING_MODE_OPTIONS = [
  {
    value: 'hash',
    label: 'Hash the file name',
    description:
      "The filename will be hashed so the file's original name won't be exposed.",
  },
  {
    value: 'hash-path',
    label: 'Use a hashed path with the original file name',
    description:
      'Use the original file name, but put it inside a hashed directory.',
  },
  {
    value: 'clean',
    label: 'Use the original file name only',
    description:
      'The file will be uploaded to the bucket as-is, without a hashed directory.',
  },
];

/**
 * Returns whether an uploaded image or video doesn't match any of the
 * recommended aspect ratios.
 */
function testAspectRatioMismatch(
  value: FileFieldValueType,
  aspectRatios: AspectRatio[]
): boolean {
  if (!value?.src || aspectRatios.length === 0) {
    return false;
  }
  const isMedia =
    testIsImageFile(value.src) ||
    testIsImageFile(value.filename || '') ||
    testIsVideoFile(value.src) ||
    testIsVideoFile(value.filename || '');
  if (!isMedia) {
    return false;
  }
  const width = Number(value.width);
  const height = Number(value.height);
  if (!(width > 0 && height > 0)) {
    return false;
  }
  return !testAnyAspectRatioMatches(width, height, aspectRatios);
}

/** Returns whether a file should display the alt text field (based on its filename). */
function testShouldHaveAltText(filename: string | undefined): boolean {
  if (!filename) {
    return false;
  }
  return testIsImageFile(filename) || testIsVideoFile(filename);
}

function testSupportsCreatePlaceholder(acceptedFileTypes: string[]) {
  return (
    acceptedFileTypes.some((type) => type.startsWith('image/')) ||
    acceptedFileTypes.length === 0
  );
}

/**
 * Inline styles for the preview canvas: the file's aspect ratio and a max
 * height (both dropped while the info panel is open), and a dark background
 * when the file asks for one.
 */
function canvasPreviewInlineStyles(
  uploadedFile: UploadedFile,
  infoOpened: boolean
) {
  const inlineStyles: CSSProperties = {};
  if (!infoOpened) {
    inlineStyles.aspectRatio = '16 / 9';
    inlineStyles.maxHeight = '280px';
    if (uploadedFile.width && uploadedFile.height) {
      inlineStyles.aspectRatio = `${uploadedFile.width} / ${uploadedFile.height}`;
      let maxHeight = Math.min(uploadedFile.height, 280);
      if (maxHeight < 80) {
        maxHeight = 80;
      }
      inlineStyles.maxHeight = `${maxHeight}px`;
    }
  }

  if (uploadedFile.canvasBgColor === 'dark') {
    // The canvas shows the file itself, so it's black whatever the theme.
    inlineStyles.backgroundColor = '#000';
  }
  return inlineStyles;
}

/** Inline styles for the previewed image or video: its natural width, capped by the canvas. */
function previewInlineStyles(uploadedFile: UploadedFile): CSSProperties {
  return {
    width:
      uploadedFile.width && uploadedFile.height
        ? `${uploadedFile.width}px`
        : '100%',
  };
}

function getMetadataKey(key: string) {
  const parts = key.split('.');
  const last = parts.pop();
  return [...parts, `@${last}`].join('.');
}

/** Returns whether a string is an SVG. */
function testSvg(text: string): boolean {
  return /^(?:\uFEFF)?\s*(?:<!--[\s\S]*?-->\s*)*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE\s+svg[\s\S]*?>\s*)?<svg\b[^>]*?(?:\/>|>[\s\S]*?<\/svg>)\s*$/.test(
    text
  );
}
