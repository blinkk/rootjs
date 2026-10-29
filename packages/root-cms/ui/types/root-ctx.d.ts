import type {CMSBuiltInSidebarTool} from '../../core/plugin.js';
import type {Collection} from '../../core/schema.js';
import type {FirebaseContextObject} from '../hooks/useFirebase.js';

type CollectionMeta = Omit<Collection, 'fields'>;

/** `window.__ROOT_CTX`, injected by the server into the CMS page. */
declare global {
  interface Window {
    __ROOT_CTX: {
      rootConfig: {
        projectId: string;
        projectName: string;
        minimalBranding: boolean;
        domain: string;
        base: string;
        gci: string | boolean;
        i18n: {
          locales?: string[];
          defaultLocale?: string;
          urlFormat?: string;
          groups?: Record<string, {label?: string; locales: string[]}>;
          translationLanguages?: Record<string, string>;
          fallbacks?: Record<string, string[]>;
        };
        server: {
          trailingSlash?: boolean;
        };
      };
      /**
       * Metadata about the deployed build. Only set when the app is prebuilt
       * (i.e. `root build` + `root start`); `null` on the dev server.
       */
      build?: {
        /** Epoch millis for when `root build` finished. */
        timestamp: number;
      } | null;
      firebaseConfig: Record<string, string>;
      gapi?: {
        apiKey: string;
        clientId: string;
      };
      collections: Record<string, CollectionMeta>;
      sidebar?: {
        hiddenBuiltInTools?: CMSBuiltInSidebarTool[];
        tools?: Record<
          string,
          {
            icon?: string;
            label?: string;
            iframeUrl?: string;
            cmsUrl?: string;
            externalUrl?: string;
          }
        >;
      };
      experiments?: {
        ai?: boolean | {endpoint?: string};
        taskManager?: boolean;
        v2TranslationsManager?: boolean;
      };
      ai?: {
        defaultModel?: string;
        imageGenerationEnabled?: boolean;
        defaultImageModel?: string;
        models: Array<{
          id: string;
          label: string;
          description?: string;
          provider: string;
          capabilities: {
            tools: boolean;
            reasoning: boolean;
            attachments: boolean;
          };
        }>;
        imageModels?: Array<{
          id: string;
          label: string;
          description?: string;
          provider: string;
          /** Whether the model accepts a source image (image-to-image editing). */
          editing: boolean;
        }>;
      } | null;
      preview: {
        channel: true | false | 'to-preview' | 'from-preview';
      };
      /** Checks registered via the CMS plugin config. */
      checks?: Array<{
        id: string;
        label: string;
        description?: string;
        collections?: string[];
      }>;
      /** Translation services registered via the CMS plugin config. */
      translations?: Array<{
        id: string;
        label: string;
        icon?: string;
        hasImport: boolean;
        hasExport: boolean;
      }>;
      /** Default UI variant for `oneOf` fields. */
      defaultOneOfVariant?: 'dropdown' | 'picker';
      /**
       * Locales to exclude from translation import/export. Patterns support
       * wildcards, e.g. `ALL_*`.
       */
      excludeLocalesFromTranslations?: string[];
      /**
       * Origins allowed to embed the CMS in an iframe (e.g. the headless doc
       * editor). Used to validate inbound postMessages and target outbound
       * lifecycle messages from the embedded editor.
       */
      allowedIframeOrigins?: string[];
      /**
       * Whether the dependency graph is enabled (the default, unless
       * `dependencyGraph: false` is set). When enabled, the UI notifies the server after
       * client-side publishes so the graph is updated immediately.
       */
      dependencyGraphEnabled?: boolean;
      /** The project's themes and which one applies by default. */
      theme?: {
        /** Id of the theme used when a user hasn't chosen one. */
        default: string | null;
        /** The themes the project registered, in config order. */
        themes: Array<{id: string; name: string; hash: string}>;
      };
    };
    firebase: FirebaseContextObject;
  }
}
