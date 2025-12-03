import {
  ref as storageRef,
  updateMetadata,
  uploadBytesResumable,
} from 'firebase/storage';

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

export interface UploadedFile {
  src: string;
  filename?: string;
  gcsPath?: string;
  width?: number;
  height?: number;
  alt?: string;
  uploadedBy?: string;
  uploadedAt?: string | number;
  canvasBgColor?: 'light' | 'dark';
}

/** Uploads a File object to GCS. */
export async function uploadFileToGCS(
  file: File,
  options?: UploadFileOptions
): Promise<UploadedFile> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const hashHex = await sha1(file);
  const ext = getFileExt(file.name);
  const filename = options?.preserveFilename
    ? `${hashHex}/${file.name}`
    : `${hashHex}.${ext}`;
  const filePath = `${projectId}/uploads/${filename}`;
  const gcsRef = storageRef(window.firebase.storage, filePath);
  const task = uploadBytesResumable(gcsRef, file);

  // Throw if the file upload stalls for more than 10 seconds.
  // This can happen if the GCS bucket doesn't exist or if a CORS error occurs
  // before the upload even begins. `uploadBytesResumable` doesn't seem to handle this.
  let lastBytesTransferred = -1;
  let lastProgressTime = Date.now();

  await new Promise((resolve, reject) => {
    const progressTimeout = setInterval(() => {
      const currentTime = Date.now();
      if (currentTime - lastProgressTime > 10000) {
        clearInterval(progressTimeout);
        reject(new Error('Upload stalled: no progress for 10 seconds'));
      }
    }, 1000);
    task.on(
      'state_changed',
      (snapshot) => {
        // The upload has actually started, so we can clear the timeout that was checking for a stall.
        if (snapshot.bytesTransferred > 0) {
          clearInterval(progressTimeout);
        }
        console.log(
          `uploading ${file.name}: ${snapshot.bytesTransferred} / ${snapshot.totalBytes} bytes`
        );
        if (snapshot.bytesTransferred !== lastBytesTransferred) {
          lastBytesTransferred = snapshot.bytesTransferred;
          lastProgressTime = Date.now();
        }
      },
      (error) => {
        clearInterval(progressTimeout);
        reject(error);
      },
      () => {
        console.log(`uploaded ${filePath}`);
        clearInterval(progressTimeout);
        resolve(task.snapshot);
      }
    );
  });
  return finalizeUpload(gcsRef, file, ext, options);
}

async function finalizeUpload(
  gcsRef: ReturnType<typeof storageRef>,
  file: File,
  ext: string,
  options?: UploadFileOptions
): Promise<UploadedFile> {
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

    // Calculate the bg color to use for previews based on the image's avg
    // luminosity. This is an expensive calculation, so only do it on upload.
    meta.canvasBgColor = (await shouldImageUseDarkBg(file)) ? 'dark' : 'light';
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

export function testIsImageFile(src: string) {
  if (!src) {
    return false;
  }
  if (testIsGoogleCloudImageFile(src)) {
    return true;
  }
  if (src.startsWith('data:image/') || src.startsWith('blob:')) {
    return true;
  }
  const ext = getFileExt(src);
  return IMAGE_EXTS.includes(ext);
}

export function testIsGoogleCloudImageFile(src: string) {
  if (!src) {
    return false;
  }
  return src.startsWith(GCI_URL_PREFIX);
}

export function testIsVideoFile(src: string) {
  if (!src) {
    return false;
  }
  const ext = getFileExt(src);
  return VIDEO_EXTS.includes(ext);
}

export function buildDownloadURL(src: string) {
  if (testIsGoogleCloudImageFile(src)) {
    return src.split('=')[0] + '=s0-d';
  }
  return src;
}

function shouldImageUseDarkBg(file: File) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.src = reader.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let r = 0,
        g = 0,
        b = 0,
        count = 0;

      for (let i = 0; i < data.length; i += 4 * 100) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }

      const avgLuminance =
        0.299 * (r / count) + 0.587 * (g / count) + 0.114 * (b / count);
      resolve(avgLuminance < 128); // true = use dark bg
    };

    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
