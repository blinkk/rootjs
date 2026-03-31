/**
 * @module jsx-runtime
 *
 * Server-side JSX runtime for Root.js. Replaces Preact as the JSX renderer
 * for server-side rendering (SSR/SSG). This module provides the automatic
 * JSX transform entry point (`jsxImportSource`).
 *
 * Supports:
 * - Automatic JSX transform (jsx, jsxs, Fragment)
 * - Classic JSX transform (createElement / h)
 * - Context API (createContext, useContext)
 * - Server-side renderToString
 */

// =============================================================================
// Types
// =============================================================================

export type Key = string | number | null;

/**
 * A virtual DOM node representing an element, component, or fragment.
 */
export interface VNode<P = Record<string, unknown>> {
  type:
    | string
    | FunctionalComponent<P>
    | typeof Fragment
    | (new (...args: any[]) => any);
  props: P;
  key: Key;
}

/**
 * Valid children types for JSX elements.
 */
export type ComponentChildren =
  | VNode<any>
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | ComponentChildren[];

export type ComponentChild = ComponentChildren;

/**
 * A function component that receives props and returns a VNode or null.
 */
export interface FunctionalComponent<P = Record<string, unknown>> {
  (props: P): VNode<any> | null;
  displayName?: string;
  /** @internal Marks this component as a context Provider. */
  _isProvider?: boolean;
  /** @internal Reference to the context object for Provider components. */
  _context?: Context<any>;
}

/**
 * Generic component type (function components only for SSR).
 */
export type ComponentType<P = Record<string, unknown>> = FunctionalComponent<P>;

// =============================================================================
// Options (vnode lifecycle hook)
// =============================================================================

/**
 * Global options object. The `vnode` callback is invoked for every VNode
 * created via `jsx()`, `jsxs()`, or `createElement()`. This is used by the
 * renderer to inject nonce values into script/style tags.
 */
export const options: {vnode?: (vnode: VNode<any>) => void} = {};

// =============================================================================
// Fragment
// =============================================================================

/**
 * Fragment component. Renders its children without a wrapper DOM element.
 * Used as `<>...</>` or `<Fragment>...</Fragment>` in JSX.
 */
export function Fragment(props: {children?: ComponentChildren}): any {
  return props.children;
}

// =============================================================================
// JSX Automatic Runtime (jsx / jsxs)
// =============================================================================

/**
 * Creates a VNode. Used by the automatic JSX transform for elements with
 * a single child or no children.
 */
export function jsx(
  type: string | FunctionalComponent<any> | typeof Fragment,
  props: Record<string, any>,
  key?: Key
): VNode {
  const resolvedKey = key !== undefined ? key : props.key ?? null;
  const vnode: VNode = {
    type,
    props,
    key: resolvedKey,
  };

  // Strip `key` from props (it's stored on the VNode directly).
  if (props.key !== undefined) {
    const {key: _, ...rest} = props;
    vnode.props = rest;
  }

  if (options.vnode) {
    options.vnode(vnode);
  }

  return vnode;
}

/**
 * Creates a VNode with static children. Used by the automatic JSX transform
 * for elements with multiple children. Identical to `jsx()` for SSR since
 * we don't need to diff children.
 */
export {jsx as jsxs};

// =============================================================================
// Classic Runtime (createElement / h)
// =============================================================================

/**
 * Creates a VNode. Compatible with the classic `React.createElement` API.
 *
 * ```ts
 * createElement('div', {className: 'foo'}, 'Hello', ' ', 'World');
 * ```
 */
export function createElement(
  type: string | FunctionalComponent<any> | typeof Fragment,
  props?: Record<string, any> | null,
  ...children: any[]
): VNode {
  const normalizedProps: Record<string, any> = {...(props || {})};

  if (children.length === 1) {
    normalizedProps.children = children[0];
  } else if (children.length > 1) {
    normalizedProps.children = children;
  }

  const vnode: VNode = {
    type,
    props: normalizedProps,
    key: normalizedProps.key ?? null,
  };

  if (normalizedProps.key !== undefined) {
    delete normalizedProps.key;
  }

  if (options.vnode) {
    options.vnode(vnode);
  }

  return vnode;
}

export {createElement as h};

// =============================================================================
// Context API
// =============================================================================

/**
 * A context object created by `createContext()`. Provides a `Provider`
 * component and can be read via `useContext()`.
 */
export interface Context<T> {
  /** @internal Default value for this context. */
  _defaultValue: T;
  /** @internal Stack of provided values (managed by renderToString). */
  _stack: T[];
  /** Provider component that supplies a context value to descendants. */
  Provider: FunctionalComponent<{value: T; children?: ComponentChildren}>;
}

/**
 * Creates a new context with an optional default value. Returns a context
 * object with a `Provider` component.
 *
 * ```ts
 * const ThemeContext = createContext('light');
 *
 * // In a parent component:
 * <ThemeContext.Provider value="dark">
 *   <App />
 * </ThemeContext.Provider>
 *
 * // In a child component:
 * const theme = useContext(ThemeContext);
 * ```
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const ctx: Context<T> = {
    _defaultValue: defaultValue,
    _stack: [],
    Provider: null as any,
  };

  const Provider: FunctionalComponent<{
    value: T;
    children?: ComponentChildren;
  }> = () => {
    // Provider rendering is handled specially by renderToString, which
    // pushes/pops the context value around rendering children. This function
    // body is never actually called during normal SSR rendering.
    return null;
  };
  Provider.displayName = 'ContextProvider';
  Provider._isProvider = true;
  Provider._context = ctx;
  ctx.Provider = Provider;

  return ctx;
}

/**
 * Reads the current value of a context. Must be called during the render
 * of a function component that is a descendant of a matching Provider.
 * Returns the default value if no Provider is found.
 *
 * ```ts
 * const theme = useContext(ThemeContext);
 * ```
 */
export function useContext<T>(context: Context<T>): T {
  const stack = context._stack;
  if (stack.length > 0) {
    return stack[stack.length - 1];
  }
  return context._defaultValue;
}

// Re-export JSX namespace for the automatic transform.
// TypeScript resolves JSX types from `{jsxImportSource}/jsx-runtime`.
export type {JSX} from './types.js';
