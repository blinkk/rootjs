import {describe, expect, it} from 'vitest';

import {assertPublicHttpUrl, UnsafeUrlError} from './url-safety.js';

describe('assertPublicHttpUrl', () => {
  it('rejects empty input', async () => {
    await expect(assertPublicHttpUrl('')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects malformed urls', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it('rejects http when only https is allowed (default)', async () => {
    await expect(
      assertPublicHttpUrl('http://example.com/image.png')
    ).rejects.toThrow(/scheme/);
  });

  it('rejects file: URLs', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(
      /scheme/
    );
  });

  it('rejects literal IPv4 loopback', async () => {
    await expect(
      assertPublicHttpUrl('https://127.0.0.1/foo')
    ).rejects.toThrow(/ip address not allowed/);
  });

  it('rejects literal IPv4 private ranges', async () => {
    await expect(assertPublicHttpUrl('https://10.0.0.1/')).rejects.toThrow(
      /ip address not allowed/
    );
    await expect(
      assertPublicHttpUrl('https://192.168.1.1/')
    ).rejects.toThrow(/ip address not allowed/);
    await expect(
      assertPublicHttpUrl('https://172.16.0.1/')
    ).rejects.toThrow(/ip address not allowed/);
  });

  it('rejects link-local AWS/GCP metadata range', async () => {
    await expect(
      assertPublicHttpUrl('https://169.254.169.254/latest/meta-data/')
    ).rejects.toThrow(/ip address not allowed/);
  });

  it('rejects literal IPv6 loopback and ULA', async () => {
    await expect(assertPublicHttpUrl('https://[::1]/foo')).rejects.toThrow(
      /ip address not allowed/
    );
    await expect(
      assertPublicHttpUrl('https://[fd00::1]/foo')
    ).rejects.toThrow(/ip address not allowed/);
  });

  it('rejects IPv4-mapped IPv6 loopback', async () => {
    await expect(
      assertPublicHttpUrl('https://[::ffff:127.0.0.1]/foo')
    ).rejects.toThrow(/ip address not allowed/);
  });

  it('rejects metadata hostnames', async () => {
    await expect(
      assertPublicHttpUrl('https://metadata.google.internal/x')
    ).rejects.toThrow(/hostname not allowed/);
    await expect(assertPublicHttpUrl('https://metadata/x')).rejects.toThrow(
      /hostname not allowed/
    );
  });

  it('rejects *.internal and *.local hostnames', async () => {
    await expect(
      assertPublicHttpUrl('https://service.internal/x')
    ).rejects.toThrow(/hostname not allowed/);
    await expect(
      assertPublicHttpUrl('https://printer.local/x')
    ).rejects.toThrow(/hostname not allowed/);
  });

  it('accepts http when explicitly allowed', async () => {
    // Pick a public IP literal so DNS isn't needed.
    const out = await assertPublicHttpUrl('http://8.8.8.8/foo', {
      allowedSchemes: ['http:', 'https:'],
    });
    expect(out.hostname).toBe('8.8.8.8');
  });

  it('accepts public IPv4 literals', async () => {
    const out = await assertPublicHttpUrl('https://8.8.8.8/foo');
    expect(out.protocol).toBe('https:');
  });
});
