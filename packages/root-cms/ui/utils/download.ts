/**
 * Triggers a browser file download for a `Blob` (or string content) and
 * immediately revokes the temporary object URL.
 */
export function downloadBlob(blob: Blob | string, filename: string) {
  const file =
    typeof blob === 'string'
      ? new Blob([blob], {type: 'text/plain;charset=utf-8'})
      : blob;
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
