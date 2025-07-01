import {ref as storageRef, updateMetadata, uploadBytes} from 'firebase/storage';

/**
 * Extensions supported by the Google Image Service.
 * @see {@link https://cloud.google.com/appengine/docs/standard/services/images?tab=go#image-formats}
 */
export const GCI_SUPPORTED_EXTS = [
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'tiff',
  'webp',
];

/** Extensions compatible with the image field. */
export const IMAGE_EXTS = [...GCI_SUPPORTED_EXTS, 'svg'];

export const VIDEO_EXTS = ['mp4', 'webm'];

export const GCI_URL_PREFIX = 'https://lh3.googleusercontent.com/';

export interface UploadFileOptions {
  preserveFilename?: boolean;
  cacheControl?: string;
  disableGci?: boolean;
}

export async function uploadFileToGCS(file: File, options?: UploadFileOptions) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const hashHex = await sha1(file);
  const ext = getFileExt(file.name);
  const filename = options?.preserveFilename
    ? `${hashHex}/${file.name}`
    : `${hashHex}.${ext}`;
  const filePath = `${projectId}/uploads/${filename}`;
  const gcsRef = storageRef(window.firebase.storage, filePath);
  await uploadBytes(gcsRef, file);
  console.log(`uploaded ${filePath}`);

  const meta: Record<string, string | number> = {};
  meta.filename = file.name;
  meta.uploadedBy = window.firebase.user.email || 'unknown';
  meta.uploadedAt = String(Math.floor(new Date().getTime()));
  const gcsPath = `/${gcsRef.bucket}/${gcsRef.fullPath}`;
  let fileUrl = `https://storage.googleapis.com${gcsPath}`;
  if (IMAGE_EXTS.includes(ext)) {
    const dimens = await getImageDimensions(file);
    meta.width = dimens.width;
    meta.height = dimens.height;
    if (!options?.disableGci && GCI_SUPPORTED_EXTS.includes(ext)) {
      const gciUrl = await getGciUrl(gcsPath);
      if (gciUrl) {
        meta.gcsPath = gcsPath;
        fileUrl = gciUrl;
      }
    }
  } else if (VIDEO_EXTS.includes(ext)) {
    const dimens = await getVideoDimensions(fileUrl);
    meta.width = dimens.width;
    meta.height = dimens.height;
    console.log('video dimensions:', dimens);
  }

  // By default, set the cache-control to 365 days.
  const cacheControl = options?.cacheControl || 'public, max-age=31536000';
  await updateMetadata(gcsRef, {
    cacheControl,
    customMetadata: normalizeGcsMeta(meta),
  });
  console.log('updated meta data: ', meta);
  return {
    ...meta,
    src: fileUrl,
  };
}

export function getFileExt(filename: string) {
  return normalizeExt(filename.split('.').at(-1) || '');
}

/**
 * Normalizes file extensions like `.PNG` to `.png` and `.JPEG` to `.jpg`.
 */
function normalizeExt(ext: string) {
  let output = String(ext).toLowerCase();
  if (output === 'jpeg') {
    output = 'jpg';
  }
  return output;
}

async function getGciUrl(gcsPath: string) {
  const gciDomain = window.__ROOT_CTX.rootConfig.gci;
  if (!gciDomain) {
    return '';
  }
  const params = new URLSearchParams({gcs: gcsPath});
  const url = `${gciDomain}/_/serving_url?${params.toString()}`;
  const res = await window.fetch(url);
  if (res.status !== 200) {
    const text = await res.text();
    console.error(`failed to get gci url: ${url}`);
    console.error(text);
    throw new Error('failed to get gci url');
  }
  const resData = await res.json();
  return resData.servingUrl;
}

async function getImageDimensions(
  file: File
): Promise<{width: number; height: number}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        resolve({width: img.width, height: img.height});
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getVideoDimensions(
  url: string
): Promise<{width: number; height: number}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');

    video.addEventListener(
      'loadedmetadata',
      () => {
        const dimensions = {
          width: video.videoWidth,
          height: video.videoHeight,
        };
        resolve(dimensions);
        document.body.removeChild(video);
      },
      false
    );

    video.addEventListener(
      'error',
      () => {
        reject(new Error('Failed to load video metadata'));
        document.body.removeChild(video);
      },
      false
    );

    video.className = 'sr-only';
    video.src = url;
    video.preload = 'metadata';
    document.body.appendChild(video);
  });
}

async function sha1(file: File) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

/** Stringifies all values in a file metadata object. */
function normalizeGcsMeta(meta: Record<string, any>): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(meta).forEach(([key, value]) => {
    meta[key] = String(value).trim();
  });
  return result;
}
