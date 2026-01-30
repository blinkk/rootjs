import {TextInput} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconFileUpload} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {Text} from '../../components/Text/Text.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  UploadFileOptions,
  uploadFileToGCS,
  testIsImageFile,
} from '../../utils/gcs.js';
import './AssetUploader.css';

export interface AssetUploaderProps {
  accept?: string[];
  uploadOptions?: UploadFileOptions;
}

export function AssetUploader(props: AssetUploaderProps) {
  const [asset, setAsset] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const accept = props.accept ? props.accept.join(', ') : undefined;

  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const uploadedAsset = await uploadFileToGCS(file);
      setAsset(uploadedAsset);
      setLoading(false);
    } catch (err) {
      console.error('image upload failed');
      console.error(err);
      setLoading(false);
      showNotification({
        title: 'Asset upload failed',
        message: String(err),
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
      console.log('file dropped:', file);
      uploadFile(file);
    }
  };

  useEffect(() => {
    const dropzone = ref.current;
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDragLeave);
    if (dropzone) {
      dropzone.addEventListener('drop', handleDrop);
    }
    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDragLeave);
      if (dropzone) {
        dropzone.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  return (
    <div
      className={joinClassNames('AssetUploader', isDragging && 'dragging')}
      ref={ref}
    >
      {asset?.src ? (
        <AssetUploader.FilePreview asset={asset} />
      ) : (
        <Text className="AssetUploader__noImage">Choose a file to upload.</Text>
      )}
      <label
        className="AssetUploader__uploadButton"
        role="button"
        aria-disabled={loading}
      >
        <input
          type="file"
          accept={accept}
          onChange={onFileChange}
          ref={inputRef}
        />
        <div className="AssetUploader__uploadButton__icon">
          <IconFileUpload size={16} />
        </div>
        <div className="AssetUploader__uploadButton__label">
          {loading ? 'Uploading...' : 'Upload'}
        </div>
      </label>
    </div>
  );
}

AssetUploader.FilePreview = (props: {asset: any}) => {
  const asset = props.asset;
  if (!asset?.src) {
    return null;
  }
  const isImage = testIsImageFile(asset.src);
  if (isImage) {
    return <AssetUploader.ImagePreview asset={props.asset} />;
  }
  return (
    <div className="AssetUploader__FilePreview">
      <TextInput
        className="AssetUploader__FilePreview__fileUrl"
        size="xs"
        radius={0}
        value={asset.src}
        disabled={true}
      />
    </div>
  );
};

AssetUploader.ImagePreview = (props: {asset: any}) => {
  const asset = props.asset;
  console.log(asset);
  return (
    <div className="AssetUploader__ImagePreview">
      <div className="AssetUploader__ImagePreview__image">
        <img
          src={formatImageSrc(asset.src)}
          width={asset.width}
          height={asset.height}
          alt={asset.alt || ''}
        />
        {asset.width && asset.height && (
          <div className="AssetUploader__ImagePreview__dimens">
            {`${asset.width}x${asset.height}`}
          </div>
        )}
      </div>
      <TextInput
        className="AssetUploader__ImagePreview__image__url"
        size="xs"
        radius={0}
        value={asset.src}
        disabled={true}
      />
    </div>
  );
};

function formatImageSrc(src: string) {
  if (src.startsWith('https://lh3.')) {
    return `${src}=e365-s0`;
  }
  return src;
}
