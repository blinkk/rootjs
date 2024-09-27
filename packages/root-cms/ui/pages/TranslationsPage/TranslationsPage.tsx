import {Button, Loader, Table} from '@mantine/core';
import {IconFile} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {TranslationsStatusBadges} from '../../components/TranslationsStatusBadges/TranslationsStatusBadges.js';
import {Layout} from '../../layout/Layout.js';
import {TranslationsDoc, cmsListTranslationsDocs} from '../../utils/doc.js';
import {notifyErrors} from '../../utils/notifications.js';
import {timeDiff} from '../../utils/time.js';
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
  const [translationsDocs, setTranslationsDocs] = useState<TranslationsDoc[]>(
    []
  );
  const headers = ['id', 'status', 'last update'];

  async function init() {
    setLoading(true);
    await notifyErrors(async () => {
      const translationsDocs = await cmsListTranslationsDocs();
      setTranslationsDocs(translationsDocs);
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  if (loading) {
    return <Loader color="gray" size="xl" />;
  }

  if (translationsDocs.length === 0) {
    return (
      <div className="TranslationsPage__TranslationsTable">
        <div className="TranslationsPage__TranslationsTable__empty">
          No translations in the system yet.
        </div>
      </div>
    );
  }

  function modifiedAtString(translationsDoc: TranslationsDoc) {
    const sys = translationsDoc.sys;
    if (
      sys.publishedAt &&
      sys.publishedAt.toMillis() >= sys.modifiedAt.toMillis()
    ) {
      return `published ${timeDiff(sys.publishedAt)} by ${sys.publishedBy}`;
    }
    return `updated ${timeDiff(sys.modifiedAt)} by ${sys.modifiedBy}`;
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
          {translationsDocs.map((translationsDoc) => (
            <tr key={translationsDoc.id}>
              <td>
                <div className="TranslationsPage__TranslationsTable__idCell">
                  <IconFile width={20} strokeWidth={1.5} />
                  <a href={`/cms/translations/${translationsDoc.id}`}>
                    {translationsDoc.id}
                  </a>
                </div>
              </td>
              <td>
                <TranslationsStatusBadges translationsDoc={translationsDoc} />
              </td>
              <td>{modifiedAtString(translationsDoc)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
