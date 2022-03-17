interface RpcResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export async function rpc<T = unknown>(
  endpoint: string,
  data?: unknown,
  options?: {
    file?: File;
    onProgress?: (progress: number) => void;
  }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    let payload: FormData | string;
    let url: string;
    if (options?.file) {
      url = '/cms/upload/' + endpoint;
      payload = new FormData();
      payload.append(
        'data',
        new Blob([JSON.stringify(data || {})], {
          type: 'application/json',
        })
      );
      payload.append('file', options.file);
    } else {
      url = '/cms/api/' + endpoint;
      payload = JSON.stringify(data || {});
    }

    if (options?.onProgress) {
      xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
        if (e.lengthComputable) {
          const progress = Math.floor((e.loaded / e.total) * 100);
          if (options.onProgress) {
            options.onProgress(progress);
          }
        }
      });
    }
    xhr.addEventListener('error', () => {
      reject(new Error(`failed to call ${endpoint}`));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status !== 200) {
        console.error(xhr.responseText);
        const err = xhr.responseText || xhr.statusText;
        reject(new Error(`failed to call ${endpoint}: ${err}`));
        return;
      }
      const json = JSON.parse(xhr.responseText) as RpcResponse<T>;
      if (!json.success) {
        console.error(json);
        const err = json.error || xhr.responseText;
        reject(new Error(`failed to call ${endpoint}: ${err}`));
        return;
      }
      resolve(json.data);
    });
    xhr.open('POST', url);
    if (!options?.file) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    xhr.send(payload);
  });
}
