import './FileField.css';

import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  LoadingOverlay,
  MantineSize,
  Menu,
  Modal,
  Select,
  Table,
  Text,
  Textarea,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {hideNotification, showNotification} from '@mantine/notifications';
import {
  IconCopy,
  IconCrop,
  IconDotsVertical,
  IconDownload,
  IconExternalLink,
  IconFileUpload,
  IconInfoCircle,
  IconPaperclip,
  IconPhotoStar,
  IconPhotoUp,
  IconSparkles,
  IconSquareCheck,
  IconSquareCheckFilled,
  IconTrash,
} from '@tabler/icons-preact';
import {ComponentChildren, createContext} from 'preact';
import {ChangeEvent, CSSProperties, forwardRef} from 'preact/compat';
import {lazy, Suspense} from 'preact/compat';
import {useContext, useMemo, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {useGapiClient} from '../../../hooks/useGapiClient.js';
import {ChatController, useChat} from '../../../pages/AIPage/AIPage.js';
import {joinClassNames} from '../../../utils/classes.js';
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
} from '../../../utils/gcs.js';
import {downloadFromDrive, parseGoogleDriveId} from '../../../utils/gdrive.js';
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

type FileFieldLoadingState = 'loading' | 'complete' | 'error';

type FileFieldProps = FieldProps & {
  variant?: FileFieldVariant;
  allowEditing?: boolean;
};

type FileFieldValueType = UploadedFile | null;

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
  requestGenerateAltText: (chat: ChatController) => void;
  requestPlaceholderModalOpen: () => void;
  requestImageEditorOpen: () => void;
  showAltText: boolean;
  altText: string;
  setAltText: (altText: string) => void;
  allowEditing: boolean;
}

const FileFieldContext = createContext<FileFieldContextValue | null>(null);

const ImageEditorDialog = lazy(() =>
  import('./ImageEditorDialog.js').then((m) => ({default: m.ImageEditorDialog}))
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

export interface FileUploaderProps {
  /** The currently uploaded file. */
  value?: FileFieldValueType;
  /** Callback when the file changes. */
  onChange?: (file: FileFieldValueType) => void;
  /** Allowed file extensions or MIME types. */
  accept?: string[];
  /** Whether to show naming options and overwrite protection. */
  showNamingOptions?: boolean;
  /** Variant for UI. */
  variant?: FileFieldVariant;
  className?: string;
  field?: schema.FileField;
  /** Whether to allow editing/replacing the file after upload. Default true. */
  allowEditing?: boolean;
}

interface FileFieldInternalProps {
  field: schema.FileField;
  variant?: FileFieldVariant;
  value: FileFieldValueType;
  setValue: (value: FileFieldValueType) => void;
  loadingState: FileFieldLoadingState | null;
  setLoadingState: (state: FileFieldLoadingState | null) => void;
  showNamingOptions?: boolean;
  accept?: string[];
  allowEditing?: boolean;
}

function FileFieldInternal(props: FileFieldInternalProps) {
  const {field, value, setValue, loadingState, setLoadingState} = props;
  const theme = useMantineTheme();
  const dropZoneRef = useRef<HTMLButtonElement>(null);
  const [placeholderModalOpened, setPlaceholderModalOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [imageEditorOpened, setImageEditorOpened] = useState(false);
  const gapiClient = useGapiClient();
  const allowEditing = props.allowEditing !== false;

  // New state from FileUploader
  const [namingMode, setNamingMode] = useState<'hash' | 'hash-path' | 'clean'>(
    'hash'
  );
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);

  const acceptedFileTypes =
    props.accept ??
    field.exts ??
    (props.variant === 'image' ? IMAGE_MIMETYPES : []);

  const altText = value?.alt || '';
  const showAltText = field.alt !== false;

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
      // Use prop namingMode if available, otherwise fall back to field config
      const mode =
        options?.namingMode || (field.preserveFilename ? 'clean' : 'hash');

      const uploadedFile = await uploadFileToGCS(file, {
        namingMode: mode,
        checkExists: options?.checkExists ?? false,
        cacheControl: field.cacheControl,
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

  function setAltText(newAltText: string) {
    if (!value?.src) {
      return;
    }
    setValue({...value, alt: newAltText || ''});
  }

  async function requestGenerateAltText(chat: ChatController) {
    const uploadedFile = value;
    if (!uploadedFile?.src || !chat) {
      return;
    }
    setLoadingState('loading');
    const resp = await chat.sendPrompt(
      chat.addMessage({
        sender: 'user',
        blocks: [
          {
            type: 'image',
            image: {
              src: uploadedFile.src,
            },
          },
        ],
      }),
      [
        {
          text: 'Generate alt text for the image above.',
        },
        {
          media: {
            url: uploadedFile.src,
          },
        },
      ],
      {
        mode: 'altText',
      }
    );
    if (resp?.error) {
      showNotification({
        title: 'Sorry, something went wrong.',
        message: resp.error,
        color: 'red',
        autoClose: true,
      });
    } else if (resp?.message) {
      setAltText(resp.message);
    }
    setLoadingState('complete');
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
        showAltText: showAltText,
        altText: altText,
        setAltText: setAltText,
        allowEditing: allowEditing,
      }}
    >
      <Modal
        size="sm"
        opened={placeholderModalOpened}
        onClose={() => setPlaceholderModalOpened(false)}
        title="Placeholder image"
        centered
        overlayColor={
          theme.colorScheme === 'dark'
            ? theme.colors.dark[9]
            : theme.colors.gray[2]
        }
      >
        <GenerateImageForm
          onSubmit={(file) => {
            setValue(file);
            setPlaceholderModalOpened(false);
          }}
        />
      </Modal>
      <Modal
        size="sm"
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Delete file?"
        centered
        overlayColor={
          theme.colorScheme === 'dark'
            ? theme.colors.dark[9]
            : theme.colors.gray[2]
        }
      >
        <Text size="sm" mb="lg">
          Are you sure you want to delete this file from GCS? This action cannot
          be undone.
        </Text>
        <Group grow spacing="xs">
          <Button
            variant="default"
            onClick={() => setDeleteModalOpened(false)}
            disabled={loadingState === 'loading'}
          >
            Cancel
          </Button>
          <Button
            color="red"
            onClick={handleRemoveFileConfirm}
            loading={loadingState === 'loading'}
          >
            Delete
          </Button>
        </Group>
      </Modal>
      {imageEditorOpened && value?.src && (
        <Suspense fallback={null}>
          <ImageEditorDialog
            key={value.src}
            opened={imageEditorOpened}
            onClose={() => setImageEditorOpened(false)}
            src={value.src}
            originalSrc={value.originalSrc}
            filename={value.filename}
            initialWidth={parseInt(value.width as unknown as string)}
            initialHeight={parseInt(value.height as unknown as string)}
            onSave={(file) => {
              uploadFile(file, value.originalSrc || value.src);
              setImageEditorOpened(false);
            }}
          />
        </Suspense>
      )}

      {/* Pending Upload Warning */}
      {pendingUpload ? (
        <div className="FileField__overwriteWarning">
          <div className="FileField__overwriteWarning__header">
            <Text size="sm" color="red" weight={700}>
              File already exists
            </Text>
          </div>
          <Text size="sm">
            A file named <strong>{pendingUpload.name}</strong> already exists.
          </Text>
          {existingFileUrl && (
            <Text size="sm" className="FileField__overwriteWarning__link">
              <a
                href={existingFileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View existing file <IconExternalLink size={12} />
              </a>
            </Text>
          )}

          <div className="FileField__overwriteWarning__checkbox">
            <Checkbox
              label="Confirm overwrite"
              checked={overwriteConfirmed}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setOverwriteConfirmed(e.currentTarget.checked)
              }
            />
          </div>

          <Group
            grow
            spacing="xs"
            className="FileField__overwriteWarning__actions"
          >
            <Button
              variant="default"
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
              disabled={!overwriteConfirmed}
              onClick={() =>
                uploadFile(pendingUpload, undefined, {namingMode: 'clean'})
              }
              color="red"
              loading={loadingState === 'loading'}
            >
              Overwrite
            </Button>
          </Group>
        </div>
      ) : (
        <>
          <div
            className={joinClassNames(
              'FileField',
              props.showNamingOptions && 'FileField--withOptions'
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
            <div className="FileField__settings" style={{marginTop: 8}}>
              <Select
                label="File name options"
                size="xs"
                data={[
                  {
                    value: 'hash',
                    label: 'Hide the original file name (default, hash.png)',
                  },
                  {
                    value: 'hash-path',
                    label:
                      'Use hash along with the original file name (hash/file.png)',
                  },
                  {
                    value: 'clean',
                    label: 'Use original file name only (file.png)',
                  },
                ]}
                value={namingMode}
                onChange={(val: any) => setNamingMode(val || 'hash')}
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

  return (
    <FileFieldInternal
      field={field}
      value={value}
      setValue={setValue}
      loadingState={loadingState}
      setLoadingState={setLoadingState}
      variant={props.variant}
      allowEditing={props.allowEditing}
    />
  );
}

/**
 * Standalone file uploader.
 *
 * This component is a controlled component that can be used anywhere in the UI
 * (e.g. AssetsPage). It does not connect to the CMS document state and relies
 * on the `value` and `onChange` props to manage its state.
 */
export function FileUploader(props: FileUploaderProps) {
  const [value, setValue] = useState<FileFieldValueType>(props.value || null);
  const [loadingState, setLoadingState] =
    useState<FileFieldLoadingState | null>(null);

  // Sync prop value
  if (props.value !== undefined && props.value !== value) {
    setValue(props.value);
  }

  const handleChange = (file: FileFieldValueType) => {
    setValue(file);
    if (props.onChange) {
      props.onChange(file);
    }
  };

  const defaultField: schema.FileField = {
    type: 'file',
    label: '',
  };

  return (
    <div className={joinClassNames('FileUploader', props.className)}>
      <FileFieldInternal
        field={props.field || defaultField}
        value={value}
        setValue={handleChange}
        loadingState={loadingState}
        setLoadingState={setLoadingState}
        variant={props.variant}
        showNamingOptions={props.showNamingOptions}
        accept={props.accept}
        allowEditing={props.allowEditing}
      />
    </div>
  );
}

FileField.Preview = () => {
  const ctx = useFileField();
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const chat = useChat();
  const experiments = window.__ROOT_CTX.experiments || {};

  // Videos and images are the only files that get the canvas preview.
  // Other types just show the info panel.
  const supportsCanvasPreview = testShouldHaveAltText(ctx.value?.filename);
  const [infoOpened, setInfoOpened] = useState(!supportsCanvasPreview);

  if (!ctx.value?.src) {
    return null;
  }

  return (
    <div className="FileField__Preview">
      <div className="FileField__Preview__InfoButton">
        {supportsCanvasPreview && (
          <Tooltip label="Toggle file info" position="top" withArrow>
            <ActionIcon
              onClick={() => setInfoOpened((o) => !o)}
              size="sm"
              variant="outline"
              className="FileField__Preview__InfoButton__Icon"
              aria-label="Toggle file info"
            >
              <IconInfoCircle size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Menu
          shadow="sm"
          control={
            <ActionIcon
              variant="outline"
              size="sm"
              radius="sm"
              c="black"
              className="FileField__Preview__InfoButton__Icon"
            >
              <IconDotsVertical size={16} />
            </ActionIcon>
          }
        >
          {ctx.allowEditing && (
            <>
              <Menu.Label size="sm">REPLACE</Menu.Label>
              <Menu.Item
                icon={
                  ctx.variant === 'image' ? (
                    <IconPhotoUp size={16} />
                  ) : (
                    <IconFileUpload size={16} />
                  )
                }
                onClick={() => ctx.requestFileUpload()}
              >
                Upload {ctx.variant === 'image' ? 'image' : 'file'}
              </Menu.Item>
              {testSupportsCreatePlaceholder(ctx.acceptedFileTypes) && (
                <Menu.Item
                  disabled={!ctx.value?.src}
                  icon={<IconPhotoStar size={16} />}
                  onClick={() => {
                    ctx.requestPlaceholderModalOpen();
                  }}
                >
                  Placeholder image
                </Menu.Item>
              )}
              {testIsImageFile(ctx.value?.src) &&
                !ctx.value?.src?.endsWith('.svg') && (
                  <Menu.Item
                    disabled={!ctx.value?.src}
                    icon={<IconCrop size={16} />}
                    closeMenuOnClick
                    onClick={() => {
                      ctx.requestImageEditorOpen();
                    }}
                  >
                    Edit image
                  </Menu.Item>
                )}
              <Divider />
            </>
          )}
          <Menu.Item
            disabled={ctx.value?.src?.startsWith('data:')}
            onClick={() => {
              ctx?.requestFileDownload();
            }}
            icon={<IconDownload size={16} />}
          >
            Download file
          </Menu.Item>
          <Menu.Item
            closeOnItemClick={false}
            icon={<IconCopy size={16} />}
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
          </Menu.Item>
          {ctx.allowEditing &&
            testIsImageFile(ctx.value?.src || '') &&
            ctx.value?.canvasBgColor && (
              <Menu.Item
                icon={
                  ctx.value?.canvasBgColor === 'dark' ? (
                    <IconSquareCheckFilled size={16} />
                  ) : (
                    <IconSquareCheck size={16} style={{opacity: 0.25}} />
                  )
                }
                closeOnItemClick={false}
                onClick={() => {
                  const newColor =
                    ctx.value?.canvasBgColor === 'dark' ? 'light' : 'dark';
                  if (ctx.value) {
                    ctx.setValue({...ctx.value, canvasBgColor: newColor});
                  }
                }}
              >
                Use dark canvas
              </Menu.Item>
            )}
          <Divider />
          <Menu.Item
            color="red"
            onClick={() => {
              ctx?.removeFile();
            }}
            icon={<IconTrash size={16} />}
          >
            Remove file
          </Menu.Item>
        </Menu>
      </div>

      <div
        className={joinClassNames(
          'FileField__Canvas',
          infoOpened && 'FileField__Canvas--infoOpened',
          dragging && 'dragging'
        )}
        style={canvasPreviewInlineStyles(ctx.value)}
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
          if (file && ctx && ctx.allowEditing) {
            ctx.handleFile(file);
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          if (!ctx.allowEditing) return;
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
          <div className="FileField__Canvas__Info">
            <IconPaperclip
              size={16}
              className="FileField__Canvas__Info__Icon"
            />
            <Table
              className="FileField__Canvas__Info__Table"
              verticalSpacing="xs"
              fontSize="xs"
            >
              <tbody>
                {ctx.value?.filename && (
                  <tr>
                    <td>
                      <b>Name</b>
                    </td>
                    <td>{ctx.value.filename}</td>
                  </tr>
                )}
                {ctx.value?.uploadedAt && (
                  <tr>
                    <td>
                      <b>Uploaded</b>
                    </td>
                    <td>
                      {new Date(
                        parseInt(ctx.value.uploadedAt as string, 10)
                      ).toLocaleString()}
                      {ctx.value.uploadedBy && <> by {ctx.value.uploadedBy}</>}
                    </td>
                  </tr>
                )}
                {ctx.value?.width && ctx.value?.height && (
                  <tr>
                    <td>
                      <b>Dimensions</b>
                    </td>
                    <td>
                      {ctx.value.width}x{ctx.value.height}
                    </td>
                  </tr>
                )}
                <tr>
                  <td>
                    <b>URL</b>
                  </td>
                  <td>
                    <Textarea
                      readOnly
                      value={ctx.value?.src}
                      size="xs"
                      radius={0}
                      autosize
                      maxRows={10}
                    />
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        ) : (
          <>
            {ctx.value?.width && ctx.value?.height && (
              <Box radius="sm" className="FileField__Preview__Info">
                {ctx.value.width}x{ctx.value.height}
              </Box>
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
                className="FileField__Preview__Image"
              />
            )}
            {testIsVideoFile(ctx.value?.src) && (
              <>
                <video
                  className="FileField__Preview__Image"
                  controls
                  muted
                  preload="metadata"
                >
                  <source
                    src={ctx.value.src}
                    type={`video/${getFileExt(ctx.value.src)}`}
                  />
                </video>
              </>
            )}
          </>
        )}
        {ctx.allowEditing && (
          <div className="FileField__reupload">
            <FileField.UploadButton
              className="FileField__reupload__button"
              compact
            />
          </div>
        )}
      </div>
      {ctx.allowEditing &&
        ctx.showAltText &&
        (ctx.altText ||
          testShouldHaveAltText(ctx.value?.filename) ||
          ctx.variant === 'image') && (
          <div className="DocEditor__ImageField__imagePreview__Image__Alt">
            <Textarea
              radius={0}
              className="DocEditor__ImageField__imagePreview__Image__Alt__Textarea"
              value={ctx.altText}
              placeholder="Alt text"
              size="xs"
              autosize
              disabled={ctx.loadingState === 'loading'}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                ctx?.setAltText(e.currentTarget.value);
              }}
            />
            {experiments.ai &&
              !ctx.altText &&
              ctx.value?.src?.startsWith('http') && (
                <Tooltip
                  label="Generate alt text with AI"
                  position="top"
                  withArrow
                >
                  <ActionIcon
                    className="DocEditor__ImageField__imagePreview__Image__Alt__AiButton"
                    onClick={() => {
                      ctx.requestGenerateAltText(chat);
                    }}
                    disabled={ctx.loadingState === 'loading'}
                  >
                    <IconSparkles size={20} stroke="1.75" />
                  </ActionIcon>
                </Tooltip>
              )}
          </div>
        )}
    </div>
  );
};

FileField.UploadButton = (props: {className?: string; compact?: boolean}) => {
  const ctx = useFileField();
  const loading = ctx.loadingState === 'loading';
  const iconSize = props.compact ? 14 : 16;
  return (
    <Button
      color="black"
      variant="default"
      disabled={loading}
      size={(props.compact ? 'compact-xs' : 'compact-md') as MantineSize}
      className={joinClassNames(
        'FileField__FileUploadButton',
        props.compact && 'FileField__FileUploadButton--compact'
      )}
      onClick={() => {
        ctx.requestFileUpload();
      }}
      leftIcon={
        <>
          {loading && !props.compact ? (
            <Loader size={iconSize} />
          ) : ctx?.variant === 'image' ? (
            <IconPhotoUp size={iconSize} />
          ) : (
            <IconFileUpload size={iconSize} />
          )}
        </>
      }
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
      className={joinClassNames(
        'FileField__InvisibleDropzone',
        dragging && 'dragging'
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
    <div className="FileField__Empty">
      <div className="FileField__Empty__Label">
        <FileField.UploadButton />
        {testSupportsCreatePlaceholder(ctx.acceptedFileTypes) && (
          <div>
            <Tooltip label="Create placeholder image">
              <ActionIcon
                className="FileField__Empty__Label__PlaceholderButton"
                onClick={() => {
                  ctx.requestPlaceholderModalOpen();
                }}
                title="Create placeholder image"
              >
                <IconPhotoStar size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>
      {acceptsLabel && (
        <div>
          <div className="FileField__Empty__AcceptTypes">
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
      className={joinClassNames('FileField__Dropzone', dragging && 'dragging')}
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

function canvasPreviewInlineStyles(uploadedFile: UploadedFile) {
  const inlineStyles: CSSProperties = {};
  if (uploadedFile.width && uploadedFile.height) {
    inlineStyles[
      '--canvas-aspect-ratio'
    ] = `${uploadedFile.width} / ${uploadedFile.height}`;

    inlineStyles['--canvas-asset-width'] = `${uploadedFile.width}px`;
    let maxHeight = Math.min(uploadedFile.height, 280);
    if (maxHeight < 80) {
      maxHeight = 80;
    }
    inlineStyles['--canvas-max-height'] = `${maxHeight}px`;
  }

  if (uploadedFile.canvasBgColor === 'dark') {
    inlineStyles['--canvas-bg-color'] = '#000';
  }
  return inlineStyles;
}

/** Returns whether a string is an SVG. */
function testSvg(text: string): boolean {
  return /^(?:\uFEFF)?\s*(?:<!--[\s\S]*?-->\s*)*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE\s+svg[\s\S]*?>\s*)?<svg\b[^>]*?(?:\/>|>[\s\S]*?<\/svg>)\s*$/.test(
    text
  );
}
