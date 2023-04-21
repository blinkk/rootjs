export const ACCEPT_LANG_RE =
  /((([a-zA-Z]+(-[a-zA-Z0-9]+){0,2})|\*)(;q=[0-1](\.[0-9]+)?)?)*/g;

export interface AcceptLanguage {
  code: string;
  script?: string;
  region?: string;
  quality: number;
}

export function parseAcceptLanguage(value: string): AcceptLanguage[] {
  const matches = String(value).match(ACCEPT_LANG_RE);
  if (!matches) {
    return [];
  }
  const results: AcceptLanguage[] = [];
  matches.forEach((m) => {
    if (!m) {
      return;
    }

    const parts = m.split(';');
    const ietf = parts[0].split('-');
    const hasScript = ietf.length === 3;

    results.push({
      code: ietf[0],
      script: hasScript ? ietf[1] : undefined,
      region: hasScript ? ietf[2] : ietf[1],
      quality: parts[1] ? parseFloat(parts[1].split('=')[1]) : 1.0,
    });
  });
  results.sort((a, b) => b.quality - a.quality);
  return results;
}
