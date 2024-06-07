import {ref as storageRef, updateMetadata, uploadBytes} from 'firebase/storage';

const IMAGE_EXTS = ['jpg', 'png', 'svg', 'webp'];

const GCI_SUPPORTED_EXTS = ['jpg', 'png', 'webp'];

export interface UploadFileOptions {
  preserveFilename?: boolean;
  cacheControl?: string;
  disableGci?: boolean;
}

export async function uploadFileToGCS(file: File, options?: UploadFileOptions) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const hashHex = await sha1(file);
  const ext = normalizeExt(file.name.split('.').at(-1) || '');
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
  let imageSrc = `https://storage.googleapis.com${gcsPath}`;
  if (IMAGE_EXTS.includes(ext)) {
    const dimens = await getImageDimensions(file);
    meta.width = dimens.width;
    meta.height = dimens.height;
    if (!options?.disableGci && GCI_SUPPORTED_EXTS.includes(ext)) {
      const gciUrl = await getGciUrl(gcsPath);
      if (gciUrl) {
        meta.gcsPath = gcsPath;
        imageSrc = gciUrl;
      }
    }
  }

  // By default, set the cache-control to 1hr.
  const cacheControl = options?.cacheControl || 'public, max-age=3600';
  await updateMetadata(gcsRef, {
    cacheControl,
    customMetadata: normalizeGcsMeta(meta),
  });
  console.log('updated meta data: ', meta);
  return {
    ...meta,
    src: imageSrc,
  };
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
