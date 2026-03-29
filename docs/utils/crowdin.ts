/**
 * Crowdin translation service integration for Root CMS.
 *
 * Exports CMS document strings to a Crowdin project as JSON source files, and
 * imports translations back from Crowdin. Each CMS document is mapped to a
 * separate file in Crowdin named `{collectionId}/{slug}.json`.
 *
 * Required environment variables:
 * - CROWDIN_API_TOKEN: Personal access token from Crowdin.
 * - CROWDIN_PROJECT_ID: Numeric project ID.
 * - CROWDIN_ORGANIZATION: (Optional) Organization domain for Crowdin Enterprise.
 */

import type {CMSTranslationService} from '@blinkk/root-cms/plugin';

interface CrowdinConfig {
  /** Crowdin personal access token. */
  apiToken: string;
  /** Crowdin project ID. */
  projectId: number;
  /** Optional organization name for Crowdin Enterprise. */
  organization?: string;
}

function getBaseUrl(config: CrowdinConfig): string {
  if (config.organization) {
    return `https://${config.organization}.api.crowdin.com/api/v2`;
  }
  return 'https://api.crowdin.com/api/v2';
}

async function crowdinRequest(
  config: CrowdinConfig,
  path: string,
  options: RequestInit = {}
) {
  const url = `${getBaseUrl(config)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Crowdin API ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Uploads raw file content to Crowdin Storage. Returns the storage ID.
 */
async function uploadToStorage(
  config: CrowdinConfig,
  fileName: string,
  content: string
): Promise<number> {
  const url = `${getBaseUrl(config)}/storages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      'Crowdin-API-FileName': encodeURIComponent(fileName),
    },
    body: content,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Crowdin Storage upload failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.data.id;
}

/**
 * Finds a file by name in the Crowdin project. Returns the file ID or null.
 */
async function findFile(
  config: CrowdinConfig,
  fileName: string
): Promise<number | null> {
  const data = await crowdinRequest(
    config,
    `/projects/${config.projectId}/files?filter=${encodeURIComponent(fileName)}&limit=500`
  );
  const files: Array<{data: {id: number; name: string}}> = data?.data ?? [];
  const match = files.find((f) => f.data.name === fileName);
  return match ? match.data.id : null;
}

/**
 * Adds a new file or updates an existing file in the Crowdin project.
 * Uses `keep_translations` so existing translations are preserved on update.
 */
async function addOrUpdateFile(
  config: CrowdinConfig,
  storageId: number,
  fileName: string
): Promise<number> {
  const existingFileId = await findFile(config, fileName);
  if (existingFileId) {
    const data = await crowdinRequest(
      config,
      `/projects/${config.projectId}/files/${existingFileId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          storageId,
          updateOption: 'keep_translations',
        }),
      }
    );
    return data.data.id;
  }
  const data = await crowdinRequest(
    config,
    `/projects/${config.projectId}/files`,
    {
      method: 'POST',
      body: JSON.stringify({storageId, name: fileName, type: 'json'}),
    }
  );
  return data.data.id;
}

/**
 * Builds and downloads a translated JSON file for a given language.
 * Returns the parsed key-value JSON, or an empty object on failure.
 */
async function downloadTranslation(
  config: CrowdinConfig,
  fileId: number,
  languageId: string
): Promise<Record<string, string>> {
  const buildData = await crowdinRequest(
    config,
    `/projects/${config.projectId}/translations/builds/files/${fileId}`,
    {
      method: 'POST',
      body: JSON.stringify({targetLanguageId: languageId}),
    }
  );
  const downloadUrl: string | undefined = buildData?.data?.url;
  if (!downloadUrl) {
    return {};
  }
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    return {};
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Creates a Crowdin translation service for use in the Root CMS plugin config.
 *
 * @example
 * ```ts
 * import {createCrowdinService} from './utils/crowdin.js';
 *
 * cmsPlugin({
 *   translations: [
 *     createCrowdinService({
 *       apiToken: process.env.CROWDIN_API_TOKEN!,
 *       projectId: Number(process.env.CROWDIN_PROJECT_ID),
 *     }),
 *   ],
 * });
 * ```
 */
export function createCrowdinService(config: CrowdinConfig): CMSTranslationService {
  return {
    id: 'crowdin',
    label: 'Crowdin',
    icon: 'https://crowdin.com/favicon.ico',

    onExport: async (ctx, data) => {
      // Build a JSON object mapping index keys to source strings.
      // Using numeric keys preserves ordering and allows stable round-tripping.
      const sourceJson: Record<string, string> = {};
      data.forEach((row, i) => {
        sourceJson[String(i)] = row.source;
      });

      const fileName = `${ctx.collectionId}_${ctx.slug}.json`;
      const content = JSON.stringify(sourceJson, null, 2);
      const storageId = await uploadToStorage(config, fileName, content);
      await addOrUpdateFile(config, storageId, fileName);

      return {
        message: `Exported ${data.length} strings to Crowdin project #${config.projectId}.`,
      };
    },

    onImport: async (ctx, data) => {
      const fileName = `${ctx.collectionId}_${ctx.slug}.json`;
      const fileId = await findFile(config, fileName);
      if (!fileId) {
        throw new Error(
          `File "${fileName}" not found in Crowdin. Export strings first.`
        );
      }

      // Download translations for each non-source locale.
      const translationsByLocale: Record<string, Record<string, string>> = {};
      const sourceLocale = ctx.locales[0]; // first locale is typically the source
      for (const locale of ctx.locales) {
        if (locale === sourceLocale) continue;
        try {
          translationsByLocale[locale] = await downloadTranslation(
            config,
            fileId,
            locale
          );
        } catch {
          // Language may not be configured in the Crowdin project — skip it.
        }
      }

      return data.map((row, i) => ({
        source: row.source,
        translations: Object.fromEntries(
          ctx.locales.map((locale) => [
            locale,
            translationsByLocale[locale]?.[String(i)] ||
              row.translations[locale] ||
              '',
          ])
        ),
      }));
    },
  };
}
