import {describe, expect, it, vi} from 'vitest';
import {renderSignIn} from './app.js';

describe('renderSignIn', () => {
  it('inlines the bootstrap styles with the csp nonce', async () => {
    const res: any = {setHeader: vi.fn(), status: vi.fn(), send: vi.fn()};
    const req: any = {get: () => 'example.com', headers: {}};
    await renderSignIn(req, res, {
      rootConfig: {server: {sessionCookieSecret: 'secret'}} as any,
      cmsConfig: {id: 'test'} as any,
    });
    const html: string = res.send.mock.calls[0][0];
    const match = html.match(/<style nonce="([^"]+)">([\s\S]*?)<\/style>/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toBe('{NONCE}');
    expect(match![2]).toContain('.bootstrap {');
    // The inline styles come before the external stylesheet so it can still
    // override them.
    expect(html.indexOf('<style')).toBeLessThan(
      html.indexOf('/cms/static/signin.css')
    );
  });
});
