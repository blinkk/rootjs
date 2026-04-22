/**
 * Ambient type declarations for the `virtual:root-jsx` virtual modules.
 *
 * At runtime these modules resolve to either `@blinkk/root/jsx` (SSR) or
 * `preact` (client) via the `rootJsxVirtualPlugin`. For type-checking we
 * re-export from `preact` since it is a superset of Root's JSX exports.
 */

declare module 'virtual:root-jsx' {
  export {
    ComponentChildren,
    ComponentChild,
    ComponentType,
    FunctionalComponent,
    VNode,
    createContext,
    createElement,
    Fragment,
    options,
  } from 'preact';
}

declare module 'virtual:root-jsx/hooks' {
  export {useContext} from 'preact/hooks';
}
