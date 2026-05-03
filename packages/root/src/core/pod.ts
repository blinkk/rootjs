import {PluginOption as VitePlugin} from 'vite';
import {RootConfig} from './config.js';

export interface Pod {
  /** Unique pod name, e.g. '@blinkk/root-docs-pod'. */
  name: string;

  /**
   * URL prefix for pod routes. Routes within the pod are served under this
   * mount path. Defaults to '/'.
   */
  mount?: string;

  /**
   * Priority for route conflict resolution. Higher values win when multiple
   * pods register the same URL path. User-site routes always take precedence
   * regardless of priority. Defaults to 0.
   */
  priority?: number;

  /** Absolute path to the pod's routes/ directory. */
  routesDir?: string;

  /** Absolute path(s) to the pod's elements/ directory(s). */
  elementsDirs?: string[];

  /** Absolute path to the pod's bundles/ directory. */
  bundlesDir?: string;

  /** Absolute path to the pod's collections/ directory (root-cms only). */
  collectionsDir?: string;

  /** Absolute path to the pod's translations/ directory. */
  translationsDir?: string;

  /** Extra Vite plugins contributed by the pod. */
  vitePlugins?: VitePlugin[];
}

export type PodFactory = (ctx: {rootConfig: RootConfig}) => Pod | Promise<Pod>;

export interface PodConfig {
  /** Whether the pod is enabled. Defaults to true. */
  enabled?: boolean;

  /** Override the pod's mount path. */
  mount?: string;

  /** Override the pod's priority. */
  priority?: number;

  /** Filter pod routes. */
  routes?: {
    exclude?: (string | RegExp)[];
  };

  /** Configure pod collections. */
  collections?: {
    exclude?: string[];
    /** Rename collection ids, e.g. {Posts: 'DocsPosts'}. */
    rename?: Record<string, string>;
  };
}

/**
 * Helper to define a pod with type-checking.
 */
export function definePod(pod: Pod): Pod {
  return pod;
}
