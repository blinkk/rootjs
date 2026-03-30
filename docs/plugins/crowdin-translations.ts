import type {
  CMSTranslationService,
  TranslationExportResult,
  TranslationRow,
  TranslationServiceContext,
} from '@blinkk/root-cms/plugin';

interface CrowdinTranslationServiceOptions {
  /** Crowdin API token. Defaults to `process.env.CROWDIN_API_TOKEN`. */
  apiToken?: string;
  /** Crowdin project identifier (slug). */
  projectIdentifier?: string;
  /** Crowdin API base URL. Defaults to `https://api.crowdin.com/api/v2`. */
  apiBase?: string;
  /**
   * Maps CMS locale codes to Crowdin language IDs when they differ.
   * E.g. `{es: 'es-ES', pt: 'pt-PT'}`. Unmapped locales are passed through
   * as-is.
   */
  localeMapping?: Record<string, string>;
}

/**
 * Builds a CSV import options `scheme` mapping column indices to Crowdin
 * language IDs. Column 0 is always the source/identifier column. Uses
 * localeMapping to convert CMS locale codes to Crowdin language IDs.
 */
function buildScheme(
  locales: string[],
  localeMapping: Record<string, string> = {}
): Record<string, number> {
  const scheme: Record<string, number> = {
    identifier: 0,
    sourcePhrase: 0,
    context: 1,
  };
  locales.forEach((locale, i) => {
    const crowdinLocale = localeMapping[locale] || locale;
    scheme[crowdinLocale] = i + 2;
  });
  return scheme;
}

/** Escapes a value for inclusion in a CSV field. */
function escapeCsvField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Generates a CSV string from headers and row objects. */
function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h] || '')).join(','));
  }
  return lines.join('\r\n');
}

/** Parses a CSV string into an array of objects keyed by column header. */
function parseCsv(text: string): Record<string, string>[] {
  const allRows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 0) allRows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Handle last row if file doesn't end with newline.
  row.push(field);
  if (row.some((f) => f !== '')) allRows.push(row);

  if (allRows.length < 2) return [];

  const headers = allRows[0];
  return allRows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] || '';
    });
    return obj;
  });
}

/**
 * Creates a Crowdin translation service plugin for Root CMS. Uses the
 * file-based Crowdin API to sync translations as CSV files organized by
 * Collection/Slug (e.g. Pages/foo-bar.csv).
 */
export function crowdinTranslationService(
  options?: CrowdinTranslationServiceOptions
): CMSTranslationService {
  const apiToken = options?.apiToken || process.env.CROWDIN_API_TOKEN || '';
  const apiBase = options?.apiBase || 'https://api.crowdin.com/api/v2';
  const projectIdentifier = options?.projectIdentifier || 'root-cms-docs';
  const localeMapping = options?.localeMapping || {};

  /** Maps a CMS locale to its Crowdin language ID. */
  function toCrowdinLocale(locale: string): string {
    return localeMapping[locale] || locale;
  }

  let cachedProjectId: number | null = null;

  async function crowdinFetch(
    path: string,
    fetchOptions: RequestInit = {}
  ): Promise<any> {
    const res = await fetch(`${apiBase}${path}`, {
      ...fetchOptions,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Crowdin API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  async function getProjectId(): Promise<number> {
    if (cachedProjectId) return cachedProjectId;
    const data = await crowdinFetch('/projects?limit=500');
    const project = data.data.find(
      (p: any) => p.data.identifier === projectIdentifier
    );
    if (!project) {
      throw new Error(`Crowdin project "${projectIdentifier}" not found`);
    }
    cachedProjectId = project.data.id;
    return cachedProjectId!;
  }

  async function uploadToStorage(
    fileName: string,
    content: string
  ): Promise<number> {
    const res = await fetch(`${apiBase}/storages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'text/csv',
        'Crowdin-API-FileName': encodeURIComponent(fileName),
      },
      body: content,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Crowdin Storage error (${res.status}): ${text}`);
    }
    const data = await res.json();
    return data.data.id;
  }

  async function findDirectory(
    projectId: number,
    name: string
  ): Promise<number | null> {
    const data = await crowdinFetch(
      `/projects/${projectId}/directories?filter=${encodeURIComponent(
        name
      )}&limit=500`
    );
    const dir = data.data.find((d: any) => d.data.name === name);
    return dir ? dir.data.id : null;
  }

  async function createDirectory(
    projectId: number,
    name: string
  ): Promise<number> {
    const data = await crowdinFetch(`/projects/${projectId}/directories`, {
      method: 'POST',
      body: JSON.stringify({name}),
    });
    return data.data.id;
  }

  async function findOrCreateDirectory(
    projectId: number,
    name: string
  ): Promise<number> {
    const existingId = await findDirectory(projectId, name);
    if (existingId !== null) return existingId;
    return createDirectory(projectId, name);
  }

  async function findFile(
    projectId: number,
    directoryId: number,
    name: string
  ): Promise<{id: number; name: string} | null> {
    const data = await crowdinFetch(
      `/projects/${projectId}/files?directoryId=${directoryId}&filter=${encodeURIComponent(
        name
      )}&limit=500`
    );
    const file = data.data.find((f: any) => f.data.name === name);
    return file ? {id: file.data.id, name: file.data.name} : null;
  }

  async function createCrowdinFile(
    projectId: number,
    storageId: number,
    fileName: string,
    directoryId: number,
    locales: string[]
  ): Promise<number> {
    const data = await crowdinFetch(`/projects/${projectId}/files`, {
      method: 'POST',
      body: JSON.stringify({
        storageId,
        name: fileName,
        directoryId,
        type: 'csv',
        importOptions: {
          firstLineContainsHeader: true,
          importTranslations: true,
          scheme: buildScheme(locales, localeMapping),
        },
      }),
    });
    return data.data.id;
  }

  async function updateCrowdinFile(
    projectId: number,
    fileId: number,
    storageId: number,
    locales: string[]
  ): Promise<void> {
    await crowdinFetch(`/projects/${projectId}/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({
        storageId,
        updateOption: 'keep_translations',
        importOptions: {
          firstLineContainsHeader: true,
          importTranslations: true,
          scheme: buildScheme(locales, localeMapping),
        },
      }),
    });
  }

  async function buildFileTranslation(
    projectId: number,
    fileId: number,
    targetLanguageId: string
  ): Promise<string> {
    const data = await crowdinFetch(
      `/projects/${projectId}/translations/builds/files/${fileId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          targetLanguageId,
          // Skip untranslated strings so they aren't filled with the
          // English source text. Only actual translations are returned.
          skipUntranslatedStrings: true,
        }),
      }
    );
    const downloadUrl: string = data.data.url;
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download translation (${res.status})`);
    }
    return res.text();
  }

  return {
    id: 'crowdin',
    label: 'Crowdin',
    icon: 'data:image/svg+xml,%3Csvg%20width%3D%22248%22%20height%3D%22248%22%20viewBox%3D%220%200%20248%20248%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M163.024%20177.312C157.024%20177.312%20151.667%20175.514%20147.239%20171.995C141.954%20167.851%20137.739%20161.674%20137.597%20154.402C137.525%20150.727%20141.525%20150.727%20141.525%20150.727C141.525%20150.727%20148.025%20150.649%20151.167%20150.649C154.31%20150.727%20155.238%20155.106%20155.381%20156.2C156.595%20166.053%20162.166%20170.353%20166.452%20172.308C169.023%20173.481%20168.38%20177.156%20163.024%20177.312Z%22%20fill%3D%22%23263238%22%2F%3E%3Cpath%20d%3D%22M109.1%20127.248C103.816%20126.626%2095.962%20126.082%2090.8924%20124.839C82.6811%20122.819%2082.8953%20115.438%2083.2523%20113.03C84.252%20105.804%2086.8939%2099.1224%2090.9638%2092.9069C96.0334%2085.2929%20103.317%2078.6112%20112.67%2073.1726C130.235%2062.9947%20154.798%2057.323%20181.788%2057.323C201.567%2057.323%20222.202%2059.8869%20222.416%2059.8869C224.273%2060.12%20225.63%2061.907%20225.558%2063.927C225.487%2065.9471%20224.059%2067.5009%20222.202%2067.6563C219.203%2067.5786%20216.276%2067.5786%20213.491%2067.5786C186.001%2067.5786%20166.437%2071.3079%20151.87%2079.3881C137.518%2087.3129%20127.522%2099.4332%20120.739%20117.381C120.025%20118.934%20117.668%20128.18%20109.1%20127.248Z%22%20fill%3D%22%23263238%22%2F%3E%3Cpath%20d%3D%22M133.089%20201.326C119.451%20201.326%20106.594%20195.437%2096.863%20184.681C88.6235%20175.574%2083.6513%20166.388%2082.7279%20154.611C82.1597%20146.917%2085.5692%20144.248%2090.1862%20144.719C93.3825%20145.033%20103.327%20145.504%20109.009%20146.682C113.271%20147.545%20116.112%20149.901%20116.823%20154.768C120.587%20180.677%20136.924%20190.884%20146.655%20193.082C148.36%20193.475%20149.426%20194.574%20149.355%20196.537C149.284%20198.421%20148.005%20199.991%20146.3%20200.305C141.967%20201.012%20137.421%20201.326%20133.089%20201.326Z%22%20fill%3D%22%23263238%22%2F%3E%3Cpath%20d%3D%22M94.2244%20224.321C84.5472%20224.321%2075.0835%20222.782%2072.3796%20222.296C60.9946%20220.27%2051.4598%20216.786%2043.2769%20211.6C23.7091%20199.203%2011.8972%20177.326%2010.4741%20151.397C10.1183%20145.239%209.3356%20133.49%2023.9937%20134.381C30.0419%20134.705%2039.6479%20137.622%2046.4077%20139.567C54.8041%20141.917%2058.86%20148.399%2058.86%20154.8C58.86%20191.343%2091.9474%20215.489%20106.392%20215.489C112.583%20215.489%20110.306%20222.134%20107.602%20222.863C102.834%20224.159%2096.7148%20224.321%2094.2244%20224.321Z%22%20fill%3D%22%23263238%22%2F%3E%3Cpath%20d%3D%22M43.75%20116.947C38.0259%20115.921%2032.445%20113.554%2027.0071%20112.213C10.1926%20108.031%2013.0546%2091.0665%2014.6287%2086.4112C29.9407%2041.3568%2078.5238%2026.2861%20117.734%2022.262C154.654%2018.4746%20193.292%2021.394%20229.282%2031.4149C232.216%2032.2039%20241.303%2034.4132%20236.079%2039.8576C232.788%2043.2505%20219.98%2039.6998%20216.546%2039.4631C195.438%2037.885%20174.545%2037.6483%20153.509%2040.8834C131.257%2044.2763%20108.361%2051.2988%2089.972%2066.1328C81.0997%2073.3131%2073.3006%2082.466%2068.0774%2093.2758C66.7179%2096.1164%2065.6447%2098.957%2064.7145%20101.798C63.7843%20104.796%2060.2783%20119.867%2043.75%20116.947Z%22%20fill%3D%22%23263238%22%2F%3E%3Cpath%20d%3D%22M137.892%20125.638C141.043%20111.538%20155.044%2089.1945%20198.377%2090.7355C208.318%2091.0437%20203.768%2097.8239%20198.867%2097.6698C174.365%2096.8223%20162.744%20112.617%20156.654%20128.643C154.694%20133.805%20150.213%20134.576%20144.613%20133.651C140.693%20132.958%20136.422%20132.496%20137.892%20125.638Z%22%20fill%3D%22%23263238%22%2F%3E%3C%2Fsvg%3E',

    async onExport(
      ctx: TranslationServiceContext,
      data: TranslationRow[]
    ): Promise<TranslationExportResult> {
      const projectId = await getProjectId();
      const {collectionId, slug, locales} = ctx;
      const fileName = `${slug}.csv`;

      // Generate CSV with source column + context column + one column per locale.
      const headers = ['source', 'context', ...locales];
      const rows = data.map((row) => {
        const obj: Record<string, string> = {
          source: row.source,
          context: row.description || '',
        };
        for (const locale of locales) {
          obj[locale] = row.translations[locale] || '';
        }
        return obj;
      });
      const csv = toCsv(headers, rows);

      // Upload CSV to Crowdin Storage.
      const storageId = await uploadToStorage(fileName, csv);

      // Ensure the collection directory exists (e.g. "Pages").
      const directoryId = await findOrCreateDirectory(projectId, collectionId);

      // Create or update the file in Crowdin.
      const existingFile = await findFile(projectId, directoryId, fileName);
      if (existingFile) {
        await updateCrowdinFile(projectId, existingFile.id, storageId, locales);
      } else {
        await createCrowdinFile(
          projectId,
          storageId,
          fileName,
          directoryId,
          locales
        );
      }

      return {
        title: 'Exported to Crowdin',
        message: `${collectionId}/${fileName}`,
        link: {
          url: `https://crowdin.com/translate/${projectIdentifier}`,
          label: 'Open in Crowdin',
        },
      };
    },

    async onImport(
      ctx: TranslationServiceContext,
      data: TranslationRow[]
    ): Promise<TranslationRow[]> {
      const projectId = await getProjectId();
      const {collectionId, slug, locales} = ctx;
      const fileName = `${slug}.csv`;

      // Find directory and file in Crowdin.
      const directoryId = await findDirectory(projectId, collectionId);
      if (directoryId === null) {
        throw new Error(
          `Directory "${collectionId}" not found in Crowdin. Export first.`
        );
      }
      const file = await findFile(projectId, directoryId, fileName);
      if (!file) {
        throw new Error(
          `File "${collectionId}/${fileName}" not found in Crowdin. Export first.`
        );
      }

      // Build and download translations for each target locale.
      // Skip 'en' since it is the source language in Crowdin.
      const targetLocales = locales.filter((l) => l !== 'en');
      const translationMap: Record<string, Record<string, string>> = {};

      for (const locale of targetLocales) {
        const crowdinLocale = toCrowdinLocale(locale);
        const csvContent = await buildFileTranslation(
          projectId,
          file.id,
          crowdinLocale
        );
        const rows = parseCsv(csvContent);
        for (const row of rows) {
          const source = row.source || '';
          if (!source) continue;
          if (!translationMap[source]) translationMap[source] = {};
          // Check both the CMS locale code and the Crowdin language ID as
          // column headers, in case Crowdin renames the column in its output.
          const value = row[locale] || row[crowdinLocale] || '';
          if (value) {
            translationMap[source][locale] = value;
          }
        }
      }

      return data.map((row) => ({
        source: row.source,
        translations: translationMap[row.source] || {},
      }));
    },
  };
}
