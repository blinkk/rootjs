import {describe, expect, it} from 'vitest';
import {FIGMA_PROVIDER, buildExportFilename, parseFigmaUrl} from './figma.js';

describe('parseFigmaUrl', () => {
  it('parses design URLs', () => {
    expect(
      parseFigmaUrl('https://www.figma.com/design/AbC123xyz/My-File')
    ).toEqual({fileKey: 'AbC123xyz'});
  });

  it('parses node ids, converting - to :', () => {
    expect(
      parseFigmaUrl(
        'https://www.figma.com/design/AbC123xyz/My-File?node-id=12-345&t=xyz'
      )
    ).toEqual({fileKey: 'AbC123xyz', nodeId: '12:345'});
  });

  it('parses legacy file URLs', () => {
    expect(
      parseFigmaUrl('https://www.figma.com/file/AbC123xyz/My-File?node-id=1-2')
    ).toEqual({fileKey: 'AbC123xyz', nodeId: '1:2'});
  });

  it('parses proto URLs', () => {
    expect(parseFigmaUrl('https://www.figma.com/proto/AbC123xyz/Demo')).toEqual(
      {fileKey: 'AbC123xyz'}
    );
  });

  it('uses the branch key for branch URLs', () => {
    expect(
      parseFigmaUrl(
        'https://www.figma.com/design/AbC123xyz/branch/DeF456uvw/My-File'
      )
    ).toEqual({fileKey: 'DeF456uvw'});
  });

  it('accepts figma.com without www', () => {
    expect(parseFigmaUrl('https://figma.com/design/AbC123xyz/File')).toEqual({
      fileKey: 'AbC123xyz',
    });
  });

  it('rejects non-figma URLs', () => {
    expect(parseFigmaUrl('https://example.com/design/AbC123xyz/x')).toBeNull();
    expect(parseFigmaUrl('https://notfigma.com/file/AbC123xyz/x')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseFigmaUrl('')).toBeNull();
    expect(parseFigmaUrl('not a url')).toBeNull();
    expect(parseFigmaUrl('https://www.figma.com/')).toBeNull();
    expect(parseFigmaUrl('https://www.figma.com/design/')).toBeNull();
    // File keys are alphanumeric.
    expect(
      parseFigmaUrl('https://www.figma.com/design/../etc/passwd')
    ).toBeNull();
  });
});

describe('buildExportFilename', () => {
  it('builds a filename from the node name, suffix and format', () => {
    expect(buildExportFilename('hero', {suffix: '@2x', format: 'PNG'})).toEqual(
      'hero@2x.png'
    );
  });

  it('sanitizes slashes in node names', () => {
    expect(buildExportFilename('icon/24/arrow', {format: 'SVG'})).toEqual(
      'icon-24-arrow.svg'
    );
  });

  it('defaults to png and normalizes jpeg', () => {
    expect(buildExportFilename('hero', {})).toEqual('hero.png');
    expect(buildExportFilename('hero', {format: 'JPEG'})).toEqual('hero.jpg');
  });
});

describe('FIGMA_PROVIDER.parseSourceUrl', () => {
  it('returns a source ref for figma URLs', () => {
    const url = 'https://www.figma.com/design/AbC123xyz/File?node-id=1-2';
    expect(FIGMA_PROVIDER.parseSourceUrl(url)).toEqual({
      provider: 'figma',
      url: url,
      figma: {fileKey: 'AbC123xyz', nodeId: '1:2'},
    });
  });

  it('returns null for unrecognized URLs', () => {
    expect(FIGMA_PROVIDER.parseSourceUrl('https://example.com/x')).toBeNull();
  });
});
