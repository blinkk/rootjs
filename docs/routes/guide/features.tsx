import {Guide} from '@/layouts/guide';

export function Page() {
  const toc = [{id: 'overview', label: 'Overview'}];
  return (
    <Guide title="Features | Root.js" toc={toc}>
      <h1>Features</h1>

      <h2 id="overview">Overview</h2>
      <p>
        This framework is heavily inspired by a few existing projects that have
        similar goals: Next.js, Astro, and Deno Fresh. Features borrowed from
        these frameworks include:
      </p>
      <ul>
        <li>SSR and SSG support using JSX files (with Preact for rendering)</li>
        <li>SCSS modules</li>
        <li>Hot module replacement (HMR)</li>
        <li>Filesystem based routing</li>
        <li>Automatic file splitting with ESM</li>
      </ul>
      <p>
        Building on the foundations of these frameworks, the Root.js web
        framework differentiates itself in a few ways:
      </p>
      <ul>
        <li>
          Islands-based architecture and component "rehydration" using web
          components
          <ul>
            <li>
              Using web components provides a web-native interface for
              client-side logic without any extra code from the framework
            </li>
            <li>
              Any framework can be used for rendering the web components
              themselves (and can even be mix-and-matched), including Preact,
              Lit, Vue, VanillaJS, etc.
            </li>
          </ul>
        </li>
        <li>
          i18n as a first-class feature
          <ul>
            <li>
              Root.js provides an opinionated way to handle i18n with routing
              and translations handling without the need for any plugins
            </li>
          </ul>
        </li>
      </ul>
    </Guide>
  );
}

export default Page;
