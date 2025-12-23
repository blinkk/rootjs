export function replaceParams(
  urlPathFormat: string,
  params: Record<string, string>
) {
  const urlPath = urlPathFormat.replaceAll(
    /\[\[?(\.\.\.)?([\w\-_]*)\]?\]/g,
    (match: string, _wildcard: string, key: string) => {
      const val = params[key];
      if (typeof val !== 'string') {
        if (match.startsWith('[[') && match.endsWith(']]')) {
          return '';
        }
        throw new Error(`unreplaced param ${match} in url: ${urlPathFormat}`);
      }
      return val;
    }
  );
  return urlPath.replace(/\/+$/, '') || '/';
}

export function testPathHasParams(urlPath: string) {
  const segments = urlPath.split('/');
  return segments.some((segment) => {
    return segment.startsWith('[') && segment.includes(']');
  });
}
