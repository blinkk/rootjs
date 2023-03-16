import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './TranslationsPage.css';

export function TranslationsPage() {
  return (
    <Layout>
      <div className="TranslationsPage">
        <Heading size="h1">Translations</Heading>
        <Text as="p">
          This page is currently under construction, but the current idea is to
          automated translations workflows here, including creating translations
          requests by selecting specific docs, or running a batch job to find
          all untranslated jobs in the system.
        </Text>
        <Text as="p">
          Translations requests can be sent to any number of "translation
          services" that can be configured with plugins. A "Google Sheets"
          translation service will be provided by default, but a developer can
          add any number of translations services that have an API for making
          translations requests and importing them back into the system.
        </Text>
      </div>
    </Layout>
  );
}
