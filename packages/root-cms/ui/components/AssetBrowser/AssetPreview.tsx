import {showNotification} from '@mantine/notifications';
import {IconFile} from '@tabler/icons-preact';
import {
  GCI_URL_PREFIX,
  UploadedFile,
  buildDownloadURL,
  getFileExt,
  testIsGoogleCloudImageFile,
  testIsImageFile,
  testIsVideoFile,
} from '../../utils/gcs.js';

/** Renders a small thumbnail preview for an asset file. */
export function AssetThumbnail(props: {file: UploadedFile; size: number}) {
  const file = props.file || ({} as UploadedFile);
  const src = file.src || '';
  const filename = file.filename || src;
  const inlineStyle = {
    '--asset-thumb-size': `${props.size}px`,
  };
  if (src && testIsImageFile(filename)) {
    return (
      <div className="AssetBrowser__thumb" style={inlineStyle}>
        <img
          src={getAssetPreviewUrl(file, props.size * 2)}
          alt={file.alt || ''}
          loading="lazy"
        />
      </div>
    );
  }
  if (src && testIsVideoFile(filename)) {
    return (
      <div className="AssetBrowser__thumb" style={inlineStyle}>
        <video src={src} muted playsInline preload="metadata" />
      </div>
    );
  }
  const ext = getFileExt(filename);
  return (
    <div className="AssetBrowser__thumb" style={inlineStyle}>
      {ext && ext.length <= 4 ? (
        <div className="AssetBrowser__thumb__ext">{ext}</div>
      ) : (
        <IconFile size={20} stroke="1.5" />
      )}
    </div>
  );
}

/**
 * Returns a sized preview URL for an asset file. GCI-served images support
 * sizing via the `=sNN` suffix.
 */
export function getAssetPreviewUrl(file: UploadedFile, size?: number) {
  const src = file?.src || '';
  if (src.startsWith(GCI_URL_PREFIX) && size) {
    return `${src}=s${size}`;
  }
  return src;
}

/** Copies an asset's serving URL to the clipboard. */
export function copyAssetUrl(file: UploadedFile) {
  let url = file?.src || '';
  if (testIsGoogleCloudImageFile(url)) {
    url = url.split('=')[0] + '=s0';
  }
  navigator.clipboard.writeText(url).then(() => {
    showNotification({message: 'Copied URL to clipboard.', autoClose: 2000});
  });
}

/** Triggers a browser download of an asset's file. */
export function downloadAssetFile(file: UploadedFile) {
  const src = file?.src || '';
  if (!src) {
    return;
  }
  if (testIsGoogleCloudImageFile(src)) {
    const link = document.createElement('a');
    link.href = buildDownloadURL(src);
    if (file.filename) {
      link.download = file.filename;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    window.open(src, '_blank');
  }
}
