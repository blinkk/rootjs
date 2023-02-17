import {Guide} from '@/layouts/guide.js';

const PACKAGE_JSON_CODE = `
{
  "scripts": {
    "dev": "root dev",
    "build": "root build"
  }
}
`.trimStart();

const ROUTE_CODE = `
// routes/index.tsx
import {Head, Script} from '@blinkk/root';

export function Page() {
  return (
    <>
      <Head>
        <title>Welcome</title>
      </Head>
      <h1>Hello, world!</h1>
    </>
  );
}

export default Page;
`.trimStart();

export function Page() {
  const toc = [
    {id: 'overview', label: 'Overview'},
    {id: 'quick-setup', label: 'Quick setup'},
    {id: 'manual-setup', label: 'Manual setup'},
  ];
  return (
    <Guide title="Getting started | Root.js" toc={toc}>
      <h1>Getting started</h1>

      <h2 id="overview">Overview</h2>
      <p>
        The Root.js Web framework is a web development tool capable of static
        site generation (SSG) or server side rendering (SSR) using JSX as
        server-rendered templates. Under the hood, Root.js is powered by Vite
        and comes with all of the modern features that Vite provides.
      </p>

      <h2 id="quick-setup">Quick setup</h2>
      <p>
        <root-code
          code={JSON.stringify(`yarn create @blinkk/root myproject
cd myproject
yarn install
`)}
          language="bash"
        />
      </p>
      <p>
        The command above clones the{' '}
        <a href="https://github.com/blinkk/rootjs/tree/main/examples/starter">
          starter
        </a>{' '}
        package into a folder called <code>myproject</code>.
      </p>

      <h2 id="manual-setup">Manual setup</h2>
      <p>Install via NPM:</p>
      <root-code
        code={JSON.stringify('yarn add @blinkk/root')}
        language="bash"
      />

      <p>
        Add a few scripts to <code>package.json</code>:
      </p>
      <root-code code={JSON.stringify(PACKAGE_JSON_CODE)} language="json" />

      <p>
        Add your first route at <code>routes/index.tsx</code>:
      </p>
      <root-code code={JSON.stringify(ROUTE_CODE)} language="typescript" />

      <p>Start the dev server:</p>
      <root-code code={JSON.stringify('yarn dev')} language="bash" />

      <p>
        The dev server should be running at <code>http://localhost:4007</code>
      </p>
    </Guide>
  );
}

export default Page;
