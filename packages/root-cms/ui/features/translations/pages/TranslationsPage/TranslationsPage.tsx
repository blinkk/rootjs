import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {TranslationsTable} from '../../components/TranslationsTable/TranslationsTable.js';

export function TranslationsPage() {
  usePageTitle('Translations');
  return (
    <Layout>
      <div className="TranslationsPage bg-page p-page md:pb-5">
        <div className="TranslationsPage__header mb-6 flex flex-wrap items-center justify-between gap-4 md:mb-10">
          <Heading size="h1">Translations</Heading>
          <div className="TranslationsPage__headerButtons flex items-center gap-2">
            <Button variant="blue" href="/cms/translations/arb">
              Download ARB
            </Button>
          </div>
        </div>
        <Surface className="TranslationsPage__content p-4">
          <TranslationsTable />
        </Surface>
      </div>
    </Layout>
  );
}
