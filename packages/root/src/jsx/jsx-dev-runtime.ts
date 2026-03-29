/**
 * @module jsx-dev-runtime
 *
 * Development JSX runtime entry point. For SSR, this is identical to the
 * production runtime since there is no client-side diffing or dev warnings
 * to add. TypeScript / bundlers look for this module when `jsxImportSource`
 * is configured and the build is in development mode.
 */

export {jsx, jsx as jsxDEV, jsxs, Fragment} from './jsx-runtime.js';
export type {JSX} from './types.js';
