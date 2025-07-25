import {ActionIcon, TextInput, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconPhotoUp, IconTrash} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {joinClassNames} from '../../../utils/classes.js';
import {uploadFileToGCS} from '../../../utils/gcs.js';
import {FieldProps} from './FieldProps.js';

/** Mimetypes accepted by the image input field. */
const IMAGE_MIMETYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
];

/** Builds the `accept` attribute for the `input` field.*/
function buildAcceptAttribute(exts?: string[]) {
  return (exts ?? IMAGE_MIMETYPES).join(', ');
}

export function ImageField(props: FieldProps) {
  const field = props.field as schema.ImageField;
  const [img, setImg] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const accept = buildAcceptAttribute(field.exts);

  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const uploadedImage = await uploadFileToGCS(file, {
        cacheControl: field.cacheControl,
      });
      setImg((currentImg: any) => {
        // Preserve the "alt" text when the image changes.
        const newImage = Object.assign({}, uploadedImage, {
          alt: currentImg?.alt || '',
        });
        props.draft.updateKey(props.deepKey, newImage);
        return newImage;
      });
      setLoading(false);
    } catch (err) {
      console.error('image upload failed');
      console.error(err);
      setLoading(false);
      showNotification({
        title: 'Image upload failed',
        message: 'Failed to upload image: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }

    // Reset the input element in case the user wishes to re-upload the image.
    if (inputRef.current) {
      const inputEl = inputRef.current;
      inputEl.value = '';
    }
  }

  function onFileChange(e: Event) {
    const inputEl = e.target as HTMLInputElement;
    const files = inputEl.files || [];
    const file = files[0];
    if (file) {
      uploadFile(file);
    }
  }

  function setAltText(newValue: string) {
    setImg((currentImg: any) => {
      return Object.assign({}, currentImg, {alt: newValue});
    });
    props.draft.updateKey(`${props.deepKey}.alt`, newValue);
  }

  function removeImage() {
    setImg({});
    props.draft.removeKey(props.deepKey);
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files || [];
    const file = files[0];
    if (file) {
      console.log(`file dropped ("${props.deepKey}"):`, file);
      uploadFile(file);
    }
  };

  const handlePaste = async (e: ClipboardEvent) => {
    const clipboardItems = e.clipboardData?.items || [];
    for (const clipboardItem of clipboardItems) {
      if (clipboardItem.type.startsWith('image/')) {
        const file = clipboardItem.getAsFile();
        if (file && IMAGE_MIMETYPES.includes(file.type)) {
          uploadFile(file);
          return;
        }
      }
    }
  };

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setImg(newValue);
      }
    );

    const dropzone = ref.current;
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDragLeave);
    if (dropzone) {
      dropzone.addEventListener('drop', handleDrop);
    }
    return () => {
      unsubscribe();
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDragLeave);
      if (dropzone) {
        dropzone.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  const showAlt = field.alt !== false;
  const imageUploaded = img && img.src && img.src.length > 0;

  return (
    <div
      className={joinClassNames(
        'DocEditor__ImageField',
        isDragging && 'dragging'
      )}
      ref={ref}
    >
      {imageUploaded ? (
        <div className={'DocEditor__ImageField__imagePreview'}>
          <div className="DocEditor__ImageField__imagePreview__controls">
            <Tooltip label="Remove image">
              <ActionIcon
                className="DocEditor__ImageField__imagePreview__controls__trash"
                onClick={() => removeImage()}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
          <div
            className={'DocEditor__ImageField__imagePreview__image'}
            tabIndex={0}
            onPaste={handlePaste}
          >
            <img
              src={img.gciUrl || img.src}
              width={img.width}
              height={img.height}
              loading="lazy"
              alt=""
            />
            <div className="DocEditor__ImageField__imagePreview__dimens">
              {`${img.width}x${img.height}`}
            </div>
          </div>
          <TextInput
            className="DocEditor__ImageField__imagePreview__image__url"
            size="xs"
            radius={0}
            value={img.gciUrl || img.src}
            disabled={true}
          />
          {showAlt && (
            <TextInput
              className="DocEditor__ImageField__imagePreview__image__alt"
              size="xs"
              radius={0}
              value={img.alt}
              label="Alt text"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setAltText(e.currentTarget.value);
              }}
            />
          )}
        </div>
      ) : (
        <div>
          <div
            className="DocEditor__ImageField__noImage"
            tabIndex={0}
            onPaste={handlePaste}
          >
            <div style={{textAlign: 'center'}}>
              <div style={{marginBottom: '8px', fontSize: '16px'}}>📷</div>
              <div>No image</div>
              <div style={{fontSize: '10px', opacity: 0.7, marginTop: '4px'}}>
                Click below to upload or paste an image here
              </div>
            </div>
          </div>
        </div>
      )}
      {/* <Button
        color="dark"
        size="xs"
        leftIcon={<IconPhotoUp size={16} />}
      >
        Upload image
      </Button> */}
      <label
        className="DocEditor__ImageField__uploadButton"
        role="button"
        aria-disabled={loading}
        onPaste={handlePaste}
      >
        <input
          type="file"
          accept={accept}
          onChange={onFileChange}
          ref={inputRef}
        />
        <div className="DocEditor__ImageField__uploadButton__icon">
          <IconPhotoUp size={16} />
        </div>
        <div className="DocEditor__ImageField__uploadButton__label">
          {loading ? 'Uploading...' : 'Paste, drop, or click to upload image'}
        </div>
      </label>
    </div>
  );
}
