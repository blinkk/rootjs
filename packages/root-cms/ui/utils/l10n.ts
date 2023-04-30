/** Returns the sha1 hash for a source string. */
export async function sourceHash(str: string) {
  return sha1(str);
}

async function sha1(str: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex;
}
