/**
 * @module jsx
 *
 * Root.js server-side JSX renderer. A zero-dependency JSX runtime that
 * replaces Preact for server-side rendering (SSR/SSG).
 *
 * ## Quick Start
 *
 * Configure your `tsconfig.json`:
 * ```json
 * {
 *   "compilerOptions": {
 *     "jsx": "react-jsx",
 *     "jsxImportSource": "@blinkk/root/jsx"
 *   }
 * }
 * ```
 *
 * Import hooks and utilities directly:
 * ```ts
 * import {createContext, useContext, renderToString} from '@blinkk/root/jsx';
 * ```
 *
 * ## What's included
 *
 * - `jsx` / `jsxs` / `Fragment` — Automatic JSX transform
 * - `createElement` / `h` — Classic JSX transform
 * - `createContext` / `useContext` — Context API for SSR
 * - `renderToString` — Render VNode trees to HTML strings
 * - `options` — VNode lifecycle hook (for nonce injection, etc.)
 * - Full TypeScript JSX type definitions
 */

// Core runtime
export {
  jsx,
  jsxs,
  Fragment,
  createElement,
  h,
  options,
  createContext,
  useContext,
} from './jsx-runtime.js';

// Types
export type {
  VNode,
  ComponentChildren,
  ComponentChild,
  ComponentType,
  FunctionalComponent,
  Context,
  Key,
} from './jsx-runtime.js';

// Rendering
export {renderToString} from './render.js';

// JSX namespace and HTML attribute types
export type {
  HTMLAttributes,
  SVGAttributes,
  ScriptHTMLAttributes,
  DOMAttributes,
  AriaAttributes,
} from './types.js';
export type {JSX} from './types.js';
