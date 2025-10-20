import './TranslationsPage.css';

import {Button, Loader, Table, Tooltip} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
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

function getTags(tags: string | string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags.sort();
  }
  return [tags];
}

TranslationsPage.TranslationsTable = () => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<string[][]>([]);
  const [translationsMap, setTranslationsMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  const allLocales = [
    'en',
    ...locales.filter((l: string) => l !== 'en').sort(),
  ];
  const [i18nLocales, setI18nLocales] = useArrayParam('locale', allLocales);
  const collections = window.__ROOT_CTX.collections;
  console.log('xxx', collections);

  const localeHeaders = i18nLocales.map((locale) => (
    <Tooltip
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
        onClick={() => {
          toggleLocale(locale);
        }}
      >
        {locale}
      </div>
    </Tooltip>
  ));

  const headers = ['hash', 'source', ...localeHeaders, 'tags'];
  const headerValues = ['hash', 'source', ...i18nLocales, 'tags'];

  async function updateTranslationsMap() {
    setLoading(true);
    await notifyErrors(async () => {
      setTranslationsMap(await loadTranslations());
    });
    setLoading(false);
  }

  async function updateTable() {
    const tableData: any[] = [];
    Object.entries(translationsMap).forEach(([hash, translations]) => {
      tableData.push([
        hash,
        translations.source,
        ...i18nLocales.map((locale) => translations[locale] || ''),
        <>
          {getTags(translations.tags).map((tag) => {
            const attrs = {};
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
              <div>
                <Component
                  {...attrs}
                  key={tag}
                  className="TranslationsPage__TranslationsTable__Tag"
                >
                  {tag}
                </Component>
              </div>
            );
          })}
        </>,
      ]);
    });
    // Sort by the source string.
    tableData.sort((a: string[], b: string[]) => {
      return a[1].toLowerCase().localeCompare(b[1].toLowerCase());
    });
    setTableData(tableData);
  }

  useEffect(() => {
    updateTranslationsMap();
  }, []);

  useEffect(() => {
    updateTable();
  }, [translationsMap, i18nLocales]);

  /** Toggles the locale in the URL and updates the state accordingly. */
  function toggleLocale(locale: string) {
    if (i18nLocales.length === locales.length) {
      // Show only the selected locale.
      setI18nLocales([locale]);
    } else {
      // Show all locales.
      setI18nLocales(locales);
    }
  }

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
                key={header}
                data-col={headerValues[colIndex]}
                className="TranslationsPage__TranslationsTable__cell"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.map((cells) => (
            <tr key={cells[0]}>
              {cells.map((cell, colIndex) => (
                <td
                  data-col={headerValues[colIndex]}
                  data-string-cell={![0, headers.length - 1].includes(colIndex)}
                  class="TranslationsPage__TranslationsTable__cell"
                >
                  {colIndex === 0 ? (
                    <a href={`/cms/translations/${cell}`}>{cell}</a>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
