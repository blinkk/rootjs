import {Image} from '@mantine/core';
import {useEffect, useRef} from 'preact/hooks';

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

  if (!src) {
    return (
      <Image
        className={className}
        src={undefined}
        width={width}
        height={height}
        withPlaceholder={withPlaceholder}
        alt={alt}
      />
    );
  }

  if (!isMp4File(file)) {
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

  return (
    <VideoPreviewCanvas
      className={className}
      src={src}
      width={width}
      height={height}
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

function VideoPreviewCanvas(props: {
  className?: string;
  src: string;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.fillStyle = '#f1f3f5';
    context.fillRect(0, 0, props.width, props.height);

    const video = document.createElement('video');
    let cancelled = false;

    const drawFrame = () => {
      if (cancelled || !context) {
        return;
      }
      const {videoWidth, videoHeight} = video;
      if (!videoWidth || !videoHeight) {
        return;
      }
      const aspect = videoWidth / videoHeight;
      let drawWidth = props.width;
      let drawHeight = props.height;

      if (props.width / props.height > aspect) {
        drawWidth = props.height * aspect;
      } else {
        drawHeight = props.width / aspect;
      }

      const offsetX = (props.width - drawWidth) / 2;
      const offsetY = (props.height - drawHeight) / 2;

      context.clearRect(0, 0, props.width, props.height);
      context.fillStyle = '#f1f3f5';
      context.fillRect(0, 0, props.width, props.height);
      context.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    };

    const handleLoadedData = () => {
      drawFrame();
    };

    const handleError = () => {
      if (cancelled || !context) {
        return;
      }
      context.clearRect(0, 0, props.width, props.height);
      context.fillStyle = '#f1f3f5';
      context.fillRect(0, 0, props.width, props.height);
    };

    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = props.src;
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [props.src, props.width, props.height]);

  return (
    <div
      className={props.className}
      style={{
        width: `${props.width}px`,
        height: `${props.height}px`,
        backgroundColor: '#f1f3f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        width={props.width}
        height={props.height}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}
