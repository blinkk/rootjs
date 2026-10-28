import './TranslationsPage.css';

import {Button} from '@mantine/core';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {TranslationsTable} from '../../components/TranslationsTable/TranslationsTable.js';

export function TranslationsPage() {
  usePageTitle('Translations');
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
        <Surface className="TranslationsPage__content">
          <TranslationsTable />
        </Surface>
      </div>
    </Layout>
  );
}
