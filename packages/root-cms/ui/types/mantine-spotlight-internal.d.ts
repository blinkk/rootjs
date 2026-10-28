/**
 * Type shim for the inner `Spotlight` component of `@mantine/spotlight`. The
 * package only exports `SpotlightProvider`, which owns the query state and
 * offers no way to set it from outside (needed for `?modal=search&q=` deep
 * links). The global search renders the inner component directly instead,
 * using the package's own `.d.ts` for the types.
 */
declare module '@mantine/spotlight/esm/Spotlight/Spotlight.js' {
  export {Spotlight} from '@mantine/spotlight/lib/Spotlight/Spotlight.js';
}
