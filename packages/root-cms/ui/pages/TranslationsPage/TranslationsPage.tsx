import './TranslationsPage.css';

import {Button} from '@mantine/core';
import {Heading} from '../../components/Heading/Heading.js';
import {TranslationsTable} from '../../components/TranslationsTable/TranslationsTable.js';
import {Layout} from '../../layout/Layout.js';

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
        <TranslationsTable />
      </div>
    </Layout>
  );
}
