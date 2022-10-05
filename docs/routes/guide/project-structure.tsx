import {Guide} from '@/layouts/guide';

export function Page() {
  const toc = [
    {id: 'routes', label: 'routes/'},
    {id: 'elements', label: 'elements/'},
    {id: 'translations', label: 'translations/'},
    {id: 'bundles', label: 'bundles/'},
    {id: 'public', label: 'public/'},
  ];
  return (
    <Guide title="Project structure | Root.js" toc={toc}>
      <h1>Project structure</h1>

      <h2 id="routes">
        <code>routes/</code>
      </h2>
      <p>
        Routes are defined using <code>.tsx</code> files within the
        <code>routes/</code> folder and will automatically render the default
        export as a JSX server-rendered component. Under the hood, the JSX is
        rendered using Preact's <code>renderToString</code> function.
      </p>
      <p>
        Below are a few examples of routes files and the final serving path:
      </p>
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Matching URL(s)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>routes/index.tsx</code>
            </td>
            <td>
              <code>/</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>routes/about.tsx</code>
            </td>
            <td>
              <code>/about</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>routes/blog/index.tsx</code>
            </td>
            <td>
              <code>/blog</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>routes/blog/[slug].tsx</code>
            </td>
            <td>
              <div>
                <code>/blog/foo</code>
              </div>
              <div>
                <code>/blog/bar</code>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        For more info, check out the <a href="/guides/routes">Routes guide</a>.
      </p>

      <h2 id="elements">
        <code>elements/</code>
      </h2>
      <p>
        One of the key magical features that Root.js provides is the ability
        scan the rendered HTML page for custom elements and automatically inject
        inject any matching JS/TS file found in the <code>elements/</code>
        folder.
      </p>
      <p>Example:</p>
      <p>Create a file that defines your custom element:</p>
      <root-code
        code={JSON.stringify(`// elements/custom-heading/custom-heading.ts
declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'custom-heading': CustomHeadingProps;
    }
  }
}

interface CustomHeadingProps {...}

class CustomHeading {...}

window.customElements.define('custom-heading', CustomHeading);
`)}
        language="typescript"
      />

      <p>Use that custom element within your route:</p>
      <root-code
        code={JSON.stringify(`// routes/index.tsx
export default function Page() {
  return (
    <custom-heading>Hello World!</custom-heading>
  );
}
`)}
        language="typescript"
      />

      <p>
        Within your rendered HTML you should see that the dependency is
        automatically added to the page:
      </p>
      <root-code
        code={JSON.stringify(`<!-- rendered html -->
<!doctype html>
<html>
  <head>
    <script type="module" src="/elements/custom-heading/custom-heading.ts"></script>
  </head>
  <body>
    <custom-heading>Hello World!</custom-heading>
  </body>
</html>
`)}
        language="html"
      />

      <h2 id="translations">
        <code>translations/</code>
      </h2>
      <p>
        Translations are stored as JSON files, where each locale is in its own
        file and stores a map of source string to translated string.
      </p>
      <p>Example:</p>
      <root-code
        code={JSON.stringify(`// translations/es.json
{
  "Hello World!": "¡Hola Mundo!",
  "Hello {name}!": "¡Hola {name}!"
}`)}
        language="json"
      />
      <p>
        Pages can use the `useTranslations` hook which returns a function to
        translate strings for the current locale. The translations are provided
        via a Preact context at the root of the rendering tree.
      </p>
      <root-code
        code={JSON.stringify(`// routes/index.tsx
import {useTranslations} from '@blinkk/root';

export default function Page() {
  const t = useTranslations();
  return (
    <h1>{t('Hello {name}!', {name: 'Alice'})}</h1>
  );
}
`)}
        language="typescript"
      />

      <h2 id="bundles">
        <code>bundles/</code>
      </h2>
      <p>
        The "bundles" directory is used for bundling client-side code outside of custom elements. This may be useful for loading 3rd-party libraries and other common global utilities that aren't necessarily encapsulated within a custom element.
      </p>
      <p>
        Since files within "bundles" are compiled together with the files in the
        "elements" directory, the rendered output will smartly generate a module
        graph and intelligently chunk shared dependencies into separate files,
        minimizing the overall build output.
      </p>
      <p>Example:</p>
      <root-code
        code={JSON.stringify(`// routes/index.tsx
import {Script} from '@blinkk/root';

export default function Page() {
  return (
    <>
      <Script type="module" src="/bundles/main.ts" />
    </>
  );
}
`)}
        language="typescript"
      />
      <p>Rendered HTML:</p>
      <root-code
        code={JSON.stringify(`<!doctype html>
<html>
...
<script type="module" src="/assets/main-<hash>.js"></script>
`)}
        language="html"
      />

      <h2 id="public">
        <code>public/</code>
      </h2>
      <p>
        Static file serving directory. Routes that match any file within
        <code>public/</code> will be served directly, useful for things like
        robots.txt and site verification files.
      </p>

      <h2 id="config">
        <code>root.config.ts</code>
      </h2>
      <p>
        Configuration file where users can define a few project-by-project
        settings, e.g. i18n URL format, locales used by the page, Vite-specific
        settings, etc.
      </p>
      <p>Example:</p>
      <root-code
        code={JSON.stringify(`// root.config.ts
import path from 'node:path';
import {defineConfig} from '@blinkk/root';

export default defineConfig({
  i18n: {
    locales: ['en', 'fr'],
    urlFormat: '/{locale}/{path}',
  },
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(process.cwd()),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          includePaths: [path.resolve(process.cwd(), './styles')],
        },
      },
    },
  },
});
`)}
        language="typescript"
      />
      <p>
        For more info, check out the{' '}
        <a href="/guides/config">Config reference</a>.
      </p>
    </Guide>
  );
}

export default Page;
