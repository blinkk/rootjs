/**
 * A tests whether e=<name> is in the URL. For multiple experiment names, use a
 * comma-separated list in the URL.
 */
export function testHasExperimentParam(name: string) {
  const searchParams = new URLSearchParams(window.location.search);
  const e = searchParams.get('e');
  if (!e) {
    return false;
  }
  const values = e.split(',');
  return values.includes(name);
}
