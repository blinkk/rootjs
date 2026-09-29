import type {ApiReference, CliReference} from '@/utils/reference-types.js';

/**
 * Generated reference data, written by `scripts/generate_reference.ts`. Keyed
 * by file name without the extension, e.g. `cli` or `api-root-cms`.
 */
const referenceFiles = import.meta.glob<{default: unknown}>(
  '/reference/*.json',
  {eager: true}
);

export type ReferenceId =
  'cli' | 'api-root' | 'api-root-cms' | 'api-root-password-protect';

export type LoadedReference =
  {type: 'cli'; data: CliReference} | {type: 'api'; data: ApiReference};

/** Returns the generated reference data for an id, if it exists. */
export function getReference(id?: string): LoadedReference | null {
  if (!id) {
    return null;
  }
  const file = referenceFiles[`/reference/${id}.json`];
  if (!file) {
    return null;
  }
  if (id === 'cli') {
    return {type: 'cli', data: file.default as CliReference};
  }
  return {type: 'api', data: file.default as ApiReference};
}

/** Returns an anchor id for a name, e.g. `root-cms-client` for `root-cms client`. */
export function toAnchorId(...parts: string[]) {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Returns the table of contents entries (one per top-level section). */
export function getReferenceToc(reference: LoadedReference | null) {
  if (!reference) {
    return [];
  }
  if (reference.type === 'cli') {
    return reference.data.programs.map((program) => ({
      href: `#${toAnchorId(program.bin)}`,
      label: program.bin,
    }));
  }
  return reference.data.packages.flatMap((pkg) =>
    pkg.entryPoints.map((entry) => ({
      href: `#${toAnchorId(entry.importPath)}`,
      label: entry.importPath,
    }))
  );
}
