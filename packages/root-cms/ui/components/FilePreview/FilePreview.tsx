import {IconPhoto} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';

export interface FilePreviewFile {
  src?: string;
  mimeType?: string;
  [key: string]: any;
}

export interface FilePreviewProps {
  file?: FilePreviewFile | string | null;
  width: number;
  height: number;
  /**
   * Shows a placeholder (an image icon on a grey box) while the image is
   * missing, loading or failed to load.
   */
  withPlaceholder?: boolean;
  className?: string;
  alt?: string;
  /** How the file fills its box: "cover" (default) crops, "contain" doesn't. */
  fit?: 'cover' | 'contain';
}

/**
 * Renders a fixed-size preview of an image or mp4 file.
 */
export function FilePreview(props: FilePreviewProps) {
  const {file, width, height, withPlaceholder, className, alt} = props;
  const fit = props.fit || 'cover';
  const src = typeof file === 'string' ? file : file?.src;

  if (isMp4File(file)) {
    return (
      <VideoPreview
        className={className}
        src={src!}
        width={width}
        height={height}
        fit={fit}
      />
    );
  }

  return (
    <ImagePreview
      className={className}
      src={src}
      width={width}
      height={height}
      fit={fit}
      withPlaceholder={withPlaceholder}
      alt={alt}
    />
  );
}

function ImagePreview(props: {
  className?: string;
  src?: string;
  width: number;
  height: number;
  fit: 'cover' | 'contain';
  withPlaceholder?: boolean;
  alt?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(!props.src);

  // Reset when the source changes (not on mount, where a cached image may
  // already have loaded).
  const prevSrc = useRef(props.src);
  useEffect(() => {
    if (prevSrc.current === props.src) {
      return;
    }
    prevSrc.current = props.src;
    setLoaded(false);
    setError(!props.src);
  }, [props.src]);

  const showPlaceholder = props.withPlaceholder && (!loaded || error);
  const iconSize = Math.min(
    40,
    Math.round(Math.min(props.width, props.height) * 0.6)
  );

  return (
    <div
      className={cn('FilePreview', 'relative', props.className)}
      style={{width: `${props.width}px`, height: `${props.height}px`}}
    >
      {props.src && (
        <img
          className="FilePreview__image block size-full border-0"
          src={props.src}
          alt={props.alt}
          style={{objectFit: props.fit}}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      {showPlaceholder && (
        <div
          className="FilePreview__placeholder absolute inset-0 flex items-center justify-center bg-surface-hover text-muted"
          title={props.alt}
        >
          <IconPhoto size={iconSize} stroke={1.5} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function isMp4File(file?: FilePreviewFile | string | null) {
  if (!file) {
    return false;
  }

  if (typeof file === 'string') {
    return /\.mp4($|\?)/i.test(file);
  }

  if (typeof file.mimeType === 'string') {
    return file.mimeType.toLowerCase() === 'video/mp4';
  }

  const src = file.src;
  if (typeof src !== 'string') {
    return false;
  }
  return /\.mp4($|\?)/i.test(src);
}

function VideoPreview(props: {
  className?: string;
  src: string;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
}) {
  return (
    <video
      className={cn(
        'FilePreview FilePreview--video block bg-chip',
        props.className
      )}
      src={props.src}
      width={props.width}
      height={props.height}
      muted
      playsInline
      preload="metadata"
      style={{
        width: `${props.width}px`,
        height: `${props.height}px`,
        objectFit: props.fit || 'cover',
      }}
    />
  );
}
