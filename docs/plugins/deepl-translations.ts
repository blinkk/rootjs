import type {
  CMSTranslationService,
  TranslationRow,
  TranslationServiceContext,
} from '@blinkk/root-cms/plugin';

interface DeepLTranslationServiceOptions {
  /** DeepL API key. Defaults to `process.env.DEEPL_API_KEY`. */
  apiKey?: string;
  /** DeepL API URL. Defaults to the free API endpoint. */
  apiUrl?: string;
  /**
   * Whether to overwrite existing CMS translations on import. When `false`,
   * only missing translations are filled in. Defaults to `true`.
   */
  overwriteOnImport?: boolean;
}

interface DeepLTranslation {
  detected_source_language: string;
  text: string;
}

interface DeepLResponse {
  translations: DeepLTranslation[];
}

/**
 * Creates a DeepL translation service plugin for Root CMS. Translates source
 * strings to all configured locales using the DeepL API.
 */
export function deeplTranslationService(
  options?: DeepLTranslationServiceOptions
): CMSTranslationService {
  const apiKey = options?.apiKey || process.env.DEEPL_API_KEY || '';
  const apiUrl = options?.apiUrl || 'https://api-free.deepl.com/v2/translate';
  const overwriteOnImport = options?.overwriteOnImport ?? true;

  async function translateTexts(
    texts: string[],
    targetLang: string,
    sourceLang?: string
  ): Promise<string[]> {
    const body: Record<string, unknown> = {
      text: texts,
      target_lang: targetLang.toUpperCase(),
    };
    if (sourceLang) {
      body.source_lang = sourceLang.toUpperCase();
    }
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DeepL API error (${res.status}): ${errorText}`);
    }
    const data: DeepLResponse = await res.json();
    return data.translations.map((t) => t.text);
  }

  return {
    id: 'deepl',
    label: 'DeepL',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTQiIGhlaWdodD0iNjgiIHZpZXdCb3g9IjAgMCA1NCA2OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTAuMTg3NSAxNy4yNzQxVjQ0LjA4NDhDMC4xODc1IDQ1LjQ3NzUgMC45MTc4MTMgNDYuNzU0MiAyLjEwOTM4IDQ3LjQ1MDZMMjUuMTcxOSA2MC44MzY2QzI2LjM2MzQgNjEuNTMzIDI3LjgyNDEgNjEuNTMzIDI5LjAxNTYgNjAuODM2Nkw1Mi4wNzgxIDQ3LjQ1MDZDNTMuMjY5NyA0Ni43NTQyIDU0IDQ1LjQ3NzUgNTQgNDQuMDg0OFYxNy4yNzQxQzU0IDE1Ljg4MTMgNTMuMjY5NyAxNC42MDQ2IDUyLjA3ODEgMTMuOTA4M0wyOS4wMTU2IDAuNTIyMjg1QzI3LjgyNDEgLTAuMTc0MDk1IDI2LjM2MzQgLTAuMTc0MDk1IDI1LjE3MTkgMC41MjIyODVMMi4xMDkzOCAxMy45NDdDMC45MTc4MTMgMTQuNjQzMyAwLjE4NzUgMTUuOTIgMC4xODc1IDE3LjI3NDFaIiBmaWxsPSIjMEYyQjQ2Ii8+CjxwYXRoIGQ9Ik0zNi43MDMxIDY3LjUzMDNMMzYuNjY0NyA2MS43MjcxTDM2LjcwMzEgNTYuMzg4MkwyMy4yNSA1OS43MTUzIiBmaWxsPSIjMEYyQjQ2Ii8+CjxwYXRoIGQ9Ik0zNi4wODc5IDU1LjkyMzhMMzguNjI0OCA1NS4yNjYxTDM3LjY2MzggNTUuODA3N0MzNy4wODczIDU2LjE1NTkgMzYuNzAyOSA1Ni43NzQ5IDM2LjcwMjkgNTcuNDcxM1Y1OC41NTQ2TDM2LjA4NzkgNTUuOTIzOFoiIGZpbGw9IiMxNDJDNDYiLz4KPHBhdGggZD0iTTE3Ljc5MDQgMTguNDc0NEMxOS4zMjc5IDE2Ljk2NTYgMjEuNzg3OSAxNi45NjU2IDIzLjMyNTQgMTguNDc0NEMyNC45NzgyIDIwLjA2MDYgMjQuOTc4MiAyMi42OTE0IDIzLjMyNTQgMjQuMjc3NkMyMS43ODc5IDI1Ljc4NjQgMTkuMzI3OSAyNS43ODY0IDE3Ljc5MDQgMjQuMjc3NkMxNi4xMzc2IDIyLjY5MTQgMTYuMTM3NiAyMC4wNjA2IDE3Ljc5MDQgMTguNDc0NFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0zNS4wODczIDI4LjU3MTZDMzYuNjI0OCAyNy4wNjI3IDM5LjA4NDggMjcuMDYyNyA0MC42MjIzIDI4LjU3MTZDNDIuMjc1MSAzMC4xNTc4IDQyLjI3NTEgMzIuNzg4NSA0MC42MjIzIDM0LjM3NDdDMzkuMDg0OCAzNS44ODM2IDM2LjYyNDggMzUuODgzNiAzNS4wODczIDM0LjM3NDdDMzMuNDM0NSAzMi43ODg1IDMzLjQzNDUgMzAuMTU3OCAzNS4wODczIDI4LjU3MTZaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTcuNzkwNCAzOS4yNDk4QzE5LjMyNzkgMzcuNzQxIDIxLjc4NzkgMzcuNzQxIDIzLjMyNTQgMzkuMjQ5OEMyNC45NzgyIDQwLjgzNiAyNC45NzgyIDQzLjQ2NjggMjMuMzI1NCA0NS4wNTNDMjEuNzg3OSA0Ni41NjE4IDE5LjMyNzkgNDYuNTYxOCAxNy43OTA0IDQ1LjA1M0MxNi4xMzc2IDQzLjQ2NjggMTYuMTM3NiA0MC44MzYgMTcuNzkwNCAzOS4yNDk4WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTIyLjQ4MDUgMjMuNTQxOUwzNC4wMTE3IDMwLjIzNDlMMzUuOTMzNiAyOS4xNTE2TDI0LjQwMjMgMjIuNDE5OUwyMi40ODA1IDIzLjU0MTlaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzQuNzgwNSAzNS4xNDgyTDI0LjQwMjMgNDEuMTgzNUwyMi40ODA1IDQwLjA2MTZMMzIuODU4NiAzNC4wNjQ5TDM0Ljc4MDUgMzUuMTQ4MloiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=',

    async onImport(
      ctx: TranslationServiceContext,
      data: TranslationRow[]
    ): Promise<TranslationRow[]> {
      const sourceTexts = data.map((row) => row.source);
      if (sourceTexts.length === 0) {
        return [];
      }

      // Translate source texts to each locale in parallel.
      const results = await Promise.all(
        ctx.locales.map(async (locale) => {
          const translated = await translateTexts(sourceTexts, locale, 'en');
          return {locale, translated};
        })
      );

      // Merge translated texts back into TranslationRow format.
      return data.map((row, i) => {
        const translations: Record<string, string> = {};
        for (const {locale, translated} of results) {
          // If overwriteOnImport is false, preserve existing translations.
          if (!overwriteOnImport && row.translations[locale]) {
            translations[locale] = row.translations[locale];
          } else {
            translations[locale] = translated[i];
          }
        }
        return {source: row.source, translations};
      });
    },
  };
}
