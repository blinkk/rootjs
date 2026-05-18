import {isIP} from 'node:net';
import {lookup} from 'node:dns/promises';

const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
]);

/**
 * Returns true if the address is in a range that should never be reached
 * from a user-supplied URL: loopback, link-local, private, broadcast,
 * carrier-grade NAT, IPv4-mapped IPv6, ULA, etc.
 */
function isPrivateOrReservedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('ff')) return true; // multicast
    // IPv4-mapped (`::ffff:127.0.0.1`) and IPv4-compatible (`::127.0.0.1`)
    // addresses can be normalized to compact forms like `::ffff:7f00:1` by
    // URL parsers, which makes a precise IPv4 re-extraction fiddly. Block
    // the entire `::ffff:0:0/96` range since these are almost only used to
    // bypass IPv4 filters, and reject any `::N.N.N.N` form too.
    if (lower.startsWith('::ffff:')) return true;
    if (/^::[0-9a-f]+:[0-9a-f]+$/.test(lower)) return true;
    return false;
  }
  // Not an IP address — defer to hostname checks.
  return false;
}

export interface AssertUrlOptions {
  /** Allowed URL schemes. Defaults to `['https:']`. */
  allowedSchemes?: string[];
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Throws `UnsafeUrlError` if `input` is a URL that could be used to reach
 * an internal/cloud-metadata endpoint via SSRF. Validation covers the
 * scheme, the literal hostname, and the resolved DNS addresses.
 *
 * Caveats: this does NOT defend against time-of-check / time-of-use races
 * (a hostname that resolves to a public IP at check time and a private IP
 * milliseconds later), nor against redirects followed by the downstream
 * HTTP client. Callers that follow redirects must re-validate each hop, or
 * use an HTTP client configured to refuse private IPs at the socket layer.
 */
export async function assertPublicHttpUrl(
  input: string,
  options?: AssertUrlOptions
): Promise<URL> {
  if (!input || typeof input !== 'string') {
    throw new UnsafeUrlError('url is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new UnsafeUrlError('url is malformed');
  }
  const allowedSchemes = options?.allowedSchemes ?? ['https:'];
  if (!allowedSchemes.includes(parsed.protocol)) {
    throw new UnsafeUrlError(`url scheme not allowed: ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new UnsafeUrlError('url hostname is empty');
  }
  if (PRIVATE_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`hostname not allowed: ${hostname}`);
  }
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    throw new UnsafeUrlError(`hostname not allowed: ${hostname}`);
  }
  // `URL.hostname` keeps the `[...]` brackets around IPv6 literals; strip
  // them before the IP check.
  const hostForIpCheck =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  const literalFamily = isIP(hostForIpCheck);
  if (literalFamily !== 0) {
    if (isPrivateOrReservedIp(hostForIpCheck)) {
      throw new UnsafeUrlError(`ip address not allowed: ${hostForIpCheck}`);
    }
    return parsed;
  }
  // Otherwise resolve DNS and check every record.
  let addresses: Array<{address: string; family: number}> = [];
  try {
    addresses = await lookup(hostname, {all: true, verbatim: true});
  } catch (err: any) {
    throw new UnsafeUrlError(`dns lookup failed: ${err?.code || err?.message}`);
  }
  if (addresses.length === 0) {
    throw new UnsafeUrlError('dns lookup returned no addresses');
  }
  for (const {address} of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new UnsafeUrlError(
        `hostname ${hostname} resolves to private ip ${address}`
      );
    }
  }
  return parsed;
}
