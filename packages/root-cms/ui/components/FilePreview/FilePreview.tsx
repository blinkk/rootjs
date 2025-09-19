import {Image} from '@mantine/core';

export interface FilePreviewFile {
  src?: string;
  mimeType?: string;
  [key: string]: any;
}

export interface FilePreviewProps {
  file?: FilePreviewFile | string | null;
  width: number;
  height: number;
  withPlaceholder?: boolean;
  className?: string;
  alt?: string;
}

export function FilePreview(props: FilePreviewProps) {
  const {file, width, height, withPlaceholder, className, alt} = props;
  const src = typeof file === 'string' ? file : file?.src;

  if (isMp4File(file)) {
    return (
      <VideoPreview
        className={className}
        src={src!}
        width={width}
        height={height}
      />
    );
  }

  return (
    <Image
      className={className}
      src={src}
      width={width}
      height={height}
      withPlaceholder={withPlaceholder}
      alt={alt}
    />
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
}) {
  return (
    <video
      className={props.className}
      src={props.src}
      width={props.width}
      height={props.height}
      muted
      playsInline
      preload="metadata"
      style={{
        width: `${props.width}px`,
        height: `${props.height}px`,
        backgroundColor: '#f1f3f5',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  );
}
