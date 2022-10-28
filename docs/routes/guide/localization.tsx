import {Guide} from '@/layouts/guide';

export function Page() {
  const toc = [
    {id: 'overview', label: 'Overview'},
    {id: 'config', label: 'Configuration'},
    {id: 'translations', label: 'Translations'},
    {id: 'useTranslations', label: 'useTranslations()'},
  ];
  return (
    <Guide title="Localization | Root.js" toc={toc}>
      <h1>Localization</h1>

      <h2 id="overview">Overview</h2>
      <p>
        Root.js has a built-in and opinionated way of handling localization,
        which includes automatic localization-aware routes and a translations
        system that uses JSON files within the <code>/translations</code>
        folder.
      </p>

      <h2 id="config">Configuration</h2>
      <p>
        Localization settings can be configured within
        <code>root.config.ts</code> using the <code>i18n</code> key, e.g.:
      </p>
      <root-code
        code={JSON.stringify(`// root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  i18n: {
    urlFormat: '/{locale}/{path}',
    locales: ['en', 'ja'],
    defaultLocale: 'en',
  },
});
`)}
        language="typescript"
      />

      <h2 id="translations">Translations</h2>
      <p>
        Translations are stored as key-value pairs in JSON files within the
        <code>/translations</code> folder.
      </p>
      <root-code
        code={JSON.stringify(`// translations/fr.json

{
  "Hello, world!": "Bonjour le monde!",
  "Hello, {name}!": "Bonjour {name}!"
}
`)}
        language="json"
      />

      <h2 id="useTranslations">useTranslations()</h2>
      <p>
        The <code>useTranslations()</code> hook can be used within a route,
        which returns a function that returns the translation for a given key.
      </p>
      <root-code
        code={JSON.stringify(`// routes/index.tsx

import {useTranslations} from '@blinkk/root';

export default function Page(props) {
  const t = useTranslations();
  if (props.name) {
    return <h1>{t('Hello, {name}!', {name: props.name})}</h1>;
  }
  return <h1>{t('Hello, world!')}</h1>;
}
`)}
        language="typescript"
      />
    </Guide>
  );
}

export default Page;
