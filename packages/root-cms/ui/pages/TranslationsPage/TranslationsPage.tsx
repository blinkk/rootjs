import './TranslationsPage.css';

import {Button, Loader, Table, Tooltip} from '@mantine/core';
import {useEffect, useState, useMemo, useCallback} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {useArrayParam} from '../../hooks/useQueryParam.js';
import {Layout} from '../../layout/Layout.js';
import {loadTranslations} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';

export function TranslationsPage() {
  return (
    <Layout>
      <div className="TranslationsPage">
        <div className="TranslationsPage__header">
          <Heading size="h1">Translations</Heading>
          <div className="TranslationsPage__header__buttons">
            <Button
              component="a"
              color="blue"
              size="xs"
              href="/cms/translations/arb"
            >
              Download ARB
            </Button>
          </div>
        </div>
        <TranslationsPage.TranslationsTable />
      </div>
    </Layout>
  );
}

/** Normalizes the tags into a sorted array of strings. */
function normalizeTags(tags: string | string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags.sort();
  }
  return [tags];
}

/** Component for rendering translation tags with proper links */
function TranslationTags({
  tags,
  collections,
}: {
  tags: string | string[] | undefined;
  collections: any;
}) {
  const normalizedTags = normalizeTags(tags);

  return (
    <>
      {normalizedTags.map((tag) => {
        const attrs: any = {};
        // Build links for tags that likely correspond to collections or docs.
        let Component: 'div' | 'a' = 'div';
        if (tag.includes('/')) {
          const [collectionId, slug] = tag.split('/');
          const collection = collections[collectionId];
          if (collection) {
            Component = 'a';
            Object.assign(attrs, {
              target: '_blank',
              href: `/cms/content/${collectionId}/${slug}`,
            });
          }
        } else if (collections[tag]) {
          Component = 'a';
          Object.assign(attrs, {
            target: '_blank',
            href: `/cms/content/${tag}`,
          });
        }
        return (
          <div key={tag}>
            <Component
              {...attrs}
              className="TranslationsPage__TranslationsTable__Tag"
            >
              {tag}
            </Component>
          </div>
        );
      })}
    </>
  );
}

TranslationsPage.TranslationsTable = () => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<any[]>([]);
  const [translationsMap, setTranslationsMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  const allLocales = useMemo(
    () => ['en', ...locales.filter((l: string) => l !== 'en').sort()],
    [locales]
  );
  const [i18nLocales, setI18nLocales] = useArrayParam('locale', allLocales);
  const collections = window.__ROOT_CTX.collections;

  /** Toggles the locale in the URL and updates the state accordingly. */
  const toggleLocale = useCallback(
    (locale: string) => {
      if (i18nLocales.length === allLocales.length) {
        // Show only the selected locale.
        setI18nLocales([locale]);
      } else {
        // Show all locales.
        setI18nLocales(allLocales);
      }
    },
    [i18nLocales.length, allLocales.length, setI18nLocales, allLocales]
  );

  const localeHeaders = useMemo(
    () =>
      i18nLocales.map((locale) => (
        <Tooltip
          key={locale}
          className="TranslationsPage__TranslationsTable__headerTooltip"
          placement="start"
          withArrow
          label={
            i18nLocales.length === allLocales.length
              ? `Show only ${locale}`
              : 'Show all locales'
          }
        >
          <div
            className="TranslationsPage__TranslationsTable__localeHeader"
            onClick={() => toggleLocale(locale)}
          >
            {locale}
          </div>
        </Tooltip>
      )),
    [i18nLocales, allLocales.length, toggleLocale]
  );

  const headers = useMemo(
    () => ['hash', 'source', ...localeHeaders, 'tags'],
    [localeHeaders]
  );
  const headerValues = useMemo(
    () => ['hash', 'source', ...i18nLocales, 'tags'],
    [i18nLocales]
  );

  async function updateTranslationsMap() {
    setLoading(true);
    await notifyErrors(async () => {
      setTranslationsMap(await loadTranslations());
    });
    setLoading(false);
  }

  const updateTable = useCallback(() => {
    const tableData: any[] = [];
    Object.entries(translationsMap).forEach(([hash, translations]) => {
      tableData.push({
        hash,
        source: translations.source,
        locales: i18nLocales.map((locale) => translations[locale] || ''),
        tags: translations.tags,
      });
    });
    // Sort by the source string.
    tableData.sort((a: any, b: any) => {
      return a.source.toLowerCase().localeCompare(b.source.toLowerCase());
    });
    setTableData(tableData);
  }, [translationsMap, i18nLocales]);

  useEffect(() => {
    updateTranslationsMap();
  }, []);

  useEffect(() => {
    updateTable();
  }, [updateTable]);

  if (loading) {
    return <Loader color="gray" size="xl" />;
  }

  if (tableData.length === 0) {
    return (
      <div className="TranslationsPage__TranslationsTable">
        <div className="TranslationsPage__TranslationsTable__empty">
          No translations in the system yet.
        </div>
      </div>
    );
  }

  return (
    <div className="TranslationsPage__TranslationsTable">
      <Table verticalSpacing="xs" striped highlightOnHover fontSize="xs">
        <thead>
          <tr>
            {headers.map((header, colIndex) => (
              <th
                key={headerValues[colIndex]}
                data-col={headerValues[colIndex]}
                className="TranslationsPage__TranslationsTable__cell"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.map((row) => (
            <tr key={row.hash}>
              <td
                key="hash"
                data-col="hash"
                data-string-cell={false}
                class="TranslationsPage__TranslationsTable__cell"
              >
                <a href={`/cms/translations/${row.hash}`}>{row.hash}</a>
              </td>
              <td
                key="source"
                data-col="source"
                data-string-cell={true}
                class="TranslationsPage__TranslationsTable__cell"
              >
                {row.source}
              </td>
              {row.locales.map((translation: string, localeIndex: number) => (
                <td
                  key={i18nLocales[localeIndex]}
                  data-col={i18nLocales[localeIndex]}
                  data-string-cell={true}
                  class="TranslationsPage__TranslationsTable__cell"
                >
                  {translation}
                </td>
              ))}
              <td
                key="tags"
                data-col="tags"
                data-string-cell={false}
                class="TranslationsPage__TranslationsTable__cell"
              >
                <TranslationTags tags={row.tags} collections={collections} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
