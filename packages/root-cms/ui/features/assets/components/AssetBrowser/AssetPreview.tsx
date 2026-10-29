import {IconFile} from '@tabler/icons-preact';
import {
  GCI_URL_PREFIX,
  UploadedFile,
  buildDownloadURL,
  getFileExt,
  testIsGoogleCloudImageFile,
  testIsImageFile,
  testIsVideoFile,
} from '../../../../integrations/gcs.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';

/** Classes for a row thumbnail box (sized by `thumbSizeStyle()`). */
export const THUMB_CLASSES =
  'flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-chip text-muted';

/** Width (4:3) and height of a row thumbnail of the given height. */
export function thumbSizeStyle(size: number) {
  return {width: `${Math.round((size * 4) / 3)}px`, height: `${size}px`};
}

/** Renders a small thumbnail preview for an asset file. */
export function AssetThumbnail(props: {file: UploadedFile; size: number}) {
  const file = props.file || ({} as UploadedFile);
  const src = file.src || '';
  const filename = file.filename || src;
  const className = cn('AssetBrowser__thumb', THUMB_CLASSES);
  const style = thumbSizeStyle(props.size);
  if (src && testIsImageFile(filename)) {
    return (
      <div className={className} style={style}>
        <img
          className="size-full object-contain"
          src={getAssetPreviewUrl(file, props.size * 2)}
          alt={file.alt || ''}
          loading="lazy"
        />
      </div>
    );
  }
  if (src && testIsVideoFile(filename)) {
    return (
      <div className={className} style={style}>
        <video
          className="size-full object-contain"
          src={src}
          muted
          playsInline
          preload="metadata"
        />
      </div>
    );
  }
  const ext = getFileExt(filename);
  return (
    <div className={className} style={style}>
      {ext && ext.length <= 4 ? (
        <div className="AssetBrowser__thumb__ext text-2xs font-bold uppercase tracking-wider">
          {ext}
        </div>
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
