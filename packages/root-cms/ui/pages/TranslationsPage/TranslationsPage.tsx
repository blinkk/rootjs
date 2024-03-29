import {Button, Loader, Table} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import {loadTranslations} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';
import './TranslationsPage.css';

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

TranslationsPage.TranslationsTable = () => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<string[][]>([]);
  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  const nonEnLocales = locales.filter((l) => l !== 'en');
  const headers = ['hash', 'source', 'en', ...nonEnLocales, 'tags'];

  async function init() {
    setLoading(true);
    await notifyErrors(async () => {
      const translationsMap = await loadTranslations();
      const tableData: any[] = [];
      Object.entries(translationsMap).forEach(([hash, translations]) => {
        const nonEnValues = nonEnLocales.map(
          (locale) => translations[locale] || ''
        );
        tableData.push([
          hash,
          translations.source,
          translations.en,
          ...nonEnValues,
          ((translations.tags as any as string[]) || []).join('\n'),
        ]);
      });
      // Sort by the source string.
      tableData.sort((a: string[], b: string[]) => {
        if (a[1].toLowerCase() < b[1].toLowerCase()) {
          return -1;
        }
        if (a[1].toLowerCase() > b[1].toLowerCase()) {
          return 1;
        }
        return 0;
      });
      setTableData(tableData);
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

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
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.map((cells) => (
            <tr key={cells[0]}>
              {cells.map((cell, colIndex) => (
                <td
                  data-col={headers[colIndex]}
                  data-string-cell={![0, headers.length - 1].includes(colIndex)}
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
