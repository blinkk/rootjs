import {GapiClient} from '../hooks/useGapiClient.js';

/** Extracts the Google Drive file ID from a URL. */
export function getGoogleDriveId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('google.com')) {
      return null;
    }
    // https://drive.google.com/open?id=...
    if (u.searchParams.has('id')) {
      return u.searchParams.get('id');
    }
    // https://drive.google.com/file/d/.../view
    // https://docs.google.com/document/d/.../edit
    const parts = u.pathname.split('/');
    const dIndex = parts.findIndex((p) => p === 'd');
    if (dIndex !== -1 && dIndex < parts.length - 1) {
      return parts[dIndex + 1];
    }
  } catch (e) {
    // Not a URL
    return null;
  }
  return null;
}

/** Downloads a file from Google Drive. */
export async function downloadFromDrive(
  gapiClient: GapiClient,
  fileId: string
): Promise<File> {
  const scope = 'https://www.googleapis.com/auth/drive.readonly';
  if (!gapiClient.isLoggedIn() || !gapiClient.hasScope(scope)) {
    await gapiClient.login({scopes: [scope]});
  }

  const gapi = (window as any).gapi;
  if (!gapi || !gapi.client || !gapi.client.drive) {
    throw new Error('Google Drive API not loaded');
  }

  const token = gapi.auth.getToken()?.access_token;
  if (!token) {
    throw new Error('No Google Drive access token found');
  }

  // Fetch metadata and content simultaneously.
  const [metaResp, contentResp] = await Promise.all([
    gapi.client.drive.files.get({
      fileId: fileId,
      fields: 'name,mimeType,size',
    }),
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
  ]);
  const meta = metaResp.result;

  if (!contentResp.ok) {
    throw new Error(
      `Failed to download file from Drive: ${contentResp.statusText}`
    );
  }

  const blob = await contentResp.blob();
  return new File([blob], meta.name, {type: meta.mimeType});
}
