/**
 * @fileoverview Refreshed copy for the developer docs (the `Docs` collection),
 * proposed as a CMS change proposal by `propose_docs_copy.ts`.
 *
 * Copy guidelines:
 * - "Root.js" is the product name. The CMS is one of its features ("the CMS",
 *   "the Root.js CMS"), not a separate "Root CMS" product.
 * - Commands use pnpm, and Node.js 24 (the current LTS) is the minimum.
 * - Anything generated from the source code (the CLI and API reference) is
 *   rendered from `reference/*.json` rather than written here.
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** The Firestore security rules applied by `root-cms init-firebase`. */
const FIRESTORE_RULES = (() => {
  const source = readFileSync(
    path.join(REPO_DIR, 'packages/root-cms/core/security.ts'),
    'utf8'
  );
  const match = source.match(/FIRESTORE_RULES = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error('failed to read FIRESTORE_RULES from security.ts');
  }
  return match[1].trim();
})();

// Helpers for building field values.

type RichTextBlock =
  | {type: 'paragraph'; data: {text: string}}
  | {type: 'heading'; data: {text: string; level: number}}
  | {
      type: 'orderedList' | 'unorderedList';
      data: {
        style: 'ordered' | 'unordered';
        items: Array<{content: string; items: []}>;
      };
    }
  | {type: 'html'; data: {html: string}};

interface RichTextValue {
  blocks: RichTextBlock[];
  time: number;
  version: string;
}

/** A paragraph of inline HTML. */
function p(text: string): RichTextBlock {
  return {type: 'paragraph', data: {text}};
}

function ul(...items: string[]): RichTextBlock {
  return {
    type: 'unorderedList',
    data: {
      style: 'unordered',
      items: items.map((content) => ({content, items: []})),
    },
  };
}

function ol(...items: string[]): RichTextBlock {
  return {
    type: 'orderedList',
    data: {
      style: 'ordered',
      items: items.map((content) => ({content, items: []})),
    },
  };
}

function html(value: string): RichTextBlock {
  return {type: 'html', data: {html: value}};
}

function richtext(...blocks: RichTextBlock[]): RichTextValue {
  return {blocks, time: Date.now(), version: '2.28.2'};
}

type Language = 'bash' | 'html' | 'json' | 'ts' | 'tsx';

function code(language: Language, value: string) {
  return {_type: 'CodeBlock', language, code: value.trim()};
}

/** A code block without a language label, e.g. a prompt to copy. */
function plain(value: string) {
  return {_type: 'CodeBlock', code: value.trim()};
}

function copy(...blocks: RichTextBlock[]) {
  return {_type: 'CopyBlock', body: richtext(...blocks)};
}

type Block =
  ReturnType<typeof code> | ReturnType<typeof plain> | ReturnType<typeof copy>;

interface Section {
  id: string;
  title: string;
  body?: RichTextValue;
  blocks?: Block[];
}

function section(
  id: string,
  title: string,
  body: RichTextBlock[],
  blocks: Block[] = []
): Section {
  return {id, title, body: richtext(...body), blocks};
}

type Category = 'start' | 'framework' | 'cms' | 'reference' | 'migration';

export interface DocCopy {
  slug: string;
  /** Shown to the reviewer in the proposal. */
  note: string;
  fields: {
    meta: {
      title: string;
      description: string;
      category: Category;
      navLabel?: string;
    };
    content: {
      title: string;
      body?: RichTextValue;
      reference?: string;
      sections: Section[];
    };
  };
}

const c = (text: string) => `<code>${text}</code>`;
const a = (href: string, text: string) => `<a href="${href}">${text}</a>`;

const ROUTES_TABLE = `<table class="routes-table">
<thead>
<tr>
<th>Route</th>
<th>Matching URL(s)</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>@/routes/index.tsx</code></td>
<td><code>/</code></td>
</tr>
<tr>
<td><code>@/routes/about.tsx</code></td>
<td><code>/about</code></td>
</tr>
<tr>
<td><code>@/routes/blog/index.tsx</code></td>
<td><code>/blog</code></td>
</tr>
<tr>
<td><code>@/routes/blog/[slug].tsx</code></td>
<td>
<ul class="code-list">
<li><code>/blog/foo</code></li>
<li><code>/blog/bar</code></li>
</ul>
</td>
</tr>
<tr>
<td><code>@/routes/docs/[...slug].tsx</code></td>
<td>
<ul class="code-list">
<li><code>/docs/foo</code></li>
<li><code>/docs/foo/bar</code></li>
</ul>
</td>
</tr>
<tr>
<td><code>@/routes/[[...page]].tsx</code></td>
<td>
<ul class="code-list">
<li><code>/</code></li>
<li><code>/foo</code></li>
<li><code>/foo/bar</code></li>
</ul>
</td>
</tr>
</tbody>
</table>`;

/**
 * Reads a file from the `starter` template, prefixed with its path, so the
 * snippets on the Getting started page match what `create-root` scaffolds.
 */
function starterFile(filePath: string): string {
  const source = readFileSync(
    path.join(REPO_DIR, 'examples/starter', filePath),
    'utf8'
  );
  return `// @/${filePath}\n\n${source}`;
}

const STARTER_FIREBASE_CONFIG = `
// @/root.config.ts

cmsPlugin({
  id: 'starter',
  name: 'Starter',
  // From Project settings > Your apps in the Firebase console.
  firebaseConfig: {
    apiKey: '...',
    authDomain: 'my-project.firebaseapp.com',
    projectId: 'my-project',
    storageBucket: 'my-project.appspot.com',
  },
}),`;

const STARTER_MODULES_FIELD = `
// @/collections/Pages.schema.ts

schema.array({
  id: 'modules',
  label: 'Modules',
  of: schema.oneOf({
    // Every \`templates/<Name>/<Name>.schema.ts\` file is available here.
    types: schema.glob('/templates/*/*.schema.ts'),
  }),
}),`;

const STARTER_TREE = `my-site/
├── collections/
│   └── Pages.schema.ts   # The Pages collection
├── components/
│   └── PageModules/      # Renders each module with its template
├── layouts/
│   └── BaseLayout.tsx    # &lt;html&gt;, &lt;head&gt;, header and footer
├── routes/
│   ├── [[...slug]].tsx   # Renders Pages docs by slug
│   └── 404.tsx
├── templates/
│   └── TemplateHero/     # TemplateHero.schema.ts, .tsx, .module.scss
├── root-cms.d.ts         # Generated types for your schemas
└── root.config.ts`;

// The docs, in sidebar order.

const GETTING_STARTED: DocCopy = {
  slug: 'index',
  note: "Adds a copy-paste prompt for setting up a site with an AI agent, replaces the manual Firebase steps with the `root-cms setup` wizard (the manual steps move to CMS configuration), and fixes the home page step to use the starter's TemplateHero template.",
  fields: {
    meta: {
      title: 'Getting started – Root.js',
      description:
        'Create a Root.js project from the starter template, by hand or with an AI agent, connect the CMS to Google Cloud, and build pages from templates.',
      category: 'start',
      navLabel: 'Getting started',
    },
    content: {
      title: 'Getting started',
      sections: [
        section('overview', 'Overview', [
          p(
            `Root.js is a web platform for building content-driven websites. It pairs a TypeScript web framework with a built-in CMS, so developers, writers and translators can work on the same site.`
          ),
          ul(
            `<b>The framework</b> renders TSX on the server, either on demand (SSR) or ahead of time as static HTML (SSG). It's built on ${a('https://vite.dev/', 'Vite')}, and it ships no client-side JavaScript unless you add it.`,
            `<b>The CMS</b> adds visual editing with live preview, localization, releases and publishing workflows. Content is stored in your own ${a('https://firebase.google.com/', 'Firebase')} project, and content models are defined in code.`
          ),
        ]),
        section(
          'requirements',
          'Requirements',
          [
            ul(
              `${a('https://nodejs.org/', 'Node.js')} 24 (the current LTS) or later.`,
              `A package manager. We recommend ${a('https://pnpm.io/', 'pnpm')}, which you can enable with Corepack.`,
              `For the CMS: the ${a('https://cloud.google.com/sdk/docs/install', 'gcloud CLI')} and a Google Cloud billing account. The CMS needs Secret Manager and a storage bucket, which require billing, but low-traffic sites usually stay in the free tier.`
            ),
          ],
          [code('bash', 'node --version  # v24 or later\ncorepack enable')]
        ),
        section(
          'ai-setup',
          'Set up with an AI agent',
          [
            p(
              `The quickest way to a working site is to let a coding agent, such as ${a('https://claude.com/claude-code', 'Claude Code')}, run the steps on this page for you. Start it in the folder where you keep your projects and paste this prompt:`
            ),
          ],
          [
            plain(
              `
Set up a new Root.js site with the CMS in ./my-site. Follow the instructions at
https://rootjs.dev/skills/root-cms-setup.md`
            ),
            copy(
              p(
                `The agent asks a few questions up front: the folder name, whether to use a new or existing Google Cloud project, and a site id. It then creates the project, runs ${c('root-cms setup')} (after showing you a dry run), starts the dev server and installs the Root.js skills, so later sessions know how to work with your content.`
              ),
              p(
                `A few steps need you, because they happen in a browser or pick who pays: signing in with ${c('gcloud')}, choosing a billing account for a new project, and turning on Google sign-in in the Firebase console. The agent tells you when.`
              ),
              p(
                `If you'd rather do it yourself, the rest of this page covers the same steps.`
              )
            ),
          ]
        ),
        section(
          'create-project',
          'Create a project',
          [
            p(
              `Scaffold a new project from the ${a('https://github.com/blinkk/rootjs/tree/main/examples/starter', 'starter')} template:`
            ),
          ],
          [
            code('bash', 'pnpm create @blinkk/root my-site'),
            copy(
              p(
                `It offers to install the dependencies and set up Google Cloud for the CMS right away. Say yes to run the setup wizard described ${a('#set-up-cms', 'below')}, or say no and run it later. Either way, start the dev server from the new folder:`
              )
            ),
            code(
              'bash',
              `
cd my-site
pnpm install
pnpm dev`
            ),
            copy(
              p(
                `The site runs at ${a('http://localhost:4007', 'http://localhost:4007')}, and pages reload as you edit them. To use a different port, set the ${c('PORT')} environment variable.`
              ),
              p(
                `The starter comes with the CMS, a ${c('Pages')} collection, and a route that builds each page from a list of templates:`
              ),
              html(`<pre><code>${STARTER_TREE}</code></pre>`),
              p(
                `Until the CMS is connected to Google Cloud, the home page shows the setup steps.`
              ),
              p(
                `<b>Just the framework?</b> The ${a('https://github.com/blinkk/rootjs/tree/main/examples/minimal', 'minimal')} template is a plain Root.js project with a single "Hello, Root.js" page at ${c('routes/index.tsx')}, and no CMS. It's a good fit for static sites. To add the CMS to it later, install ${c('@blinkk/root-cms')} and ${c('firebase-admin')}, and add ${c('cmsPlugin()')} as described in ${a('/docs/cms/', 'CMS configuration')}:`
              )
            ),
            code('bash', 'pnpm create @blinkk/root --template=minimal my-site'),
          ]
        ),
        section(
          'set-up-cms',
          'Connect the CMS to Google Cloud',
          [
            p(
              `The CMS runs inside your site at ${c('/cms/')} and stores content in Firestore, in a Google Cloud project you own. The ${c('root-cms setup')} wizard sets up that project. If you said yes in ${c('create-root')}, it has already run; otherwise run it from your project:`
            ),
          ],
          [
            code('bash', 'pnpm exec root-cms setup'),
            copy(
              p(`It asks for a new or existing project and a site id, then:`),
              ul(
                `Signs you in with ${c('gcloud')}, if needed, and links a billing account.`,
                `Adds Firebase, creates the Firestore database and storage bucket, and applies the CMS's security rules.`,
                `Makes you an ADMIN of the CMS.`,
                `Creates a service account for the site to run as in production.`,
                `Stores a session secret in Secret Manager, and creates a ${c('.root.secrets.json')} manifest to commit (see ${a('#secrets', 'Share environment variables')}).`,
                `Writes the site id and Firebase config into ${c('root.config.ts')}.`
              ),
              p(
                `One step is manual, because Google has no API for it: the wizard asks you to turn on Google sign-in in the Firebase console, links you to the page, and checks that it worked.`
              ),
              p(
                `The site id keeps this site's content, uploads and secrets apart, so several sites can share one Google Cloud project. The wizard is safe to run again: it skips anything that's already set up, so if a step fails, fix it and re-run. Pass ${c('--dry-run')} to see what it would change first.`
              ),
              p(`<b>Create your home page</b>`),
              p(
                `Restart the dev server and open ${a('http://localhost:4007/cms/', 'http://localhost:4007/cms/')}. In the ${c('Pages')} collection, create a doc with the slug ${c('index')}, add a <b>TemplateHero</b> module, and publish it. It replaces the setup page at ${c('/')}. Other slugs map to their own URL, e.g. ${c('about')} renders at ${c('/about')}.`
              ),
              p(
                `To set up Firebase without the wizard, or to see every option the CMS supports, see ${a('/docs/cms/', 'CMS configuration')}.`
              )
            ),
          ]
        ),
        section(
          'templates',
          'Build pages from templates',
          [
            p(
              `Each page in the starter is a list of modules. The ${c('Pages')} collection offers every template schema in the ${c('templates/')} folder with ${c('schema.glob()')}:`
            ),
          ],
          [
            code('ts', STARTER_MODULES_FIELD),
            copy(
              p(
                `The route at ${c('routes/[[...slug]].tsx')} loads the doc for the URL with ${c('RootCMSClient')}, and ${c('PageModules')} renders each module with the component that matches its template name. Editors can preview drafts by adding ${c('?preview=true')} to the URL.`
              ),
              p(
                `To add a template, create a folder in ${c('templates/')} with a schema and a component of the same name. For example, here's the starter's ${c('TemplateHero')} template:`
              )
            ),
            code(
              'ts',
              starterFile('templates/TemplateHero/TemplateHero.schema.ts')
            ),
            code('tsx', starterFile('templates/TemplateHero/TemplateHero.tsx')),
            copy(
              p(
                `Then regenerate the TypeScript types for your schemas. The new template shows up in the CMS the next time you open it:`
              )
            ),
            code('bash', 'pnpm exec root-cms generate-types'),
            copy(
              p(
                `Learn more in ${a('/docs/cms/schemas/', 'Schemas')} and ${a('/docs/cms/data-fetching/', 'Data fetching')}.`
              )
            ),
          ]
        ),
        section(
          'secrets',
          'Share environment variables',
          [
            p(
              `API keys and other secrets belong in a ${c('.env')} file, which shouldn't be committed. To share them with your team, ${c('root secrets')} stores them in ${a('https://cloud.google.com/secret-manager', 'Google Cloud Secret Manager')} and keeps each developer's ${c('.env')} in sync. ${c('root-cms setup')} creates the ${c('.root.secrets.json')} manifest for you; for a project without the CMS, create it with ${c('root secrets init')}:`
            ),
          ],
          [
            code(
              'bash',
              `
# Create a manifest (.root.secrets.json) and commit it.
pnpm exec root secrets init --gcp-project=my-project --gsm-key=my-site-env

# Upload the values in your .env file.
pnpm exec root secrets push

# Teammates download them into their own .env.
pnpm exec root secrets sync`
            ),
            copy(
              p(
                `Once a project has a manifest, ${c('root dev')} syncs the secrets when it starts. See the ${a('/docs/cli/#root-secrets', 'CLI reference')} for every command.`
              )
            ),
          ]
        ),
        section(
          'ai-agents',
          'Work with AI agents',
          [
            p(
              `Root.js includes skills that teach AI coding agents, such as Claude Code, how to set up the CMS and how to read and edit your content from the command line. If an agent set up your project, they're already installed. Otherwise, install them into your project and commit them:`
            ),
          ],
          [
            code('bash', 'pnpm exec root-cms skill.install'),
            copy(
              p(`With the skills installed, you can ask an agent to:`),
              ul(
                `Look up or update content, e.g. "list the pages that don't have a meta description".`,
                `Propose content changes as a YAML file that your team reviews in a pull request, then applies with ${c('root-cms proposal.apply')}.`,
                `Connect a teammate's checkout, or a new environment, to Google Cloud with ${c('root-cms setup')}.`
              ),
              p(
                `The skills install to an existing agent skills folder, such as ${c('.claude/skills')}, or to ${c('.agent/skills')} if there isn't one. Re-run the command with ${c('--force')} after upgrading ${c('@blinkk/root-cms')} to pick up new versions.`
              )
            ),
          ]
        ),
        section('next-steps', 'Next steps', [
          ul(
            `${a('/docs/project-structure/', 'Project structure')}: where routes, components and content models live.`,
            `${a('/docs/routes/', 'Routes')}: file-based routing, data fetching and SSR.`,
            `${a('/docs/deployment/', 'Deployment')}: ship your site as static HTML or with a server.`,
            `${a('/docs/cms/schemas/', 'Schemas')}: model your content.`,
            `${a('/docs/cli/', 'CLI reference')} and ${a('/docs/api/', 'API reference')}.`
          ),
        ]),
      ],
    },
  },
};

const PROJECT_STRUCTURE: DocCopy = {
  slug: 'project-structure',
  note: 'Adds the CMS folders and config files, fixes typos, and points to the Routes page instead of repeating the routes table.',
  fields: {
    meta: {
      title: 'Project structure – Root.js',
      description:
        'The files and folders in a typical Root.js project, and what each one does.',
      category: 'start',
    },
    content: {
      title: 'Project structure',
      body: richtext(
        p(
          `A typical Root.js project looks like the tree below. Only ${c('root.config.ts')} and ${c('routes/')} are required. You can also browse the ${a('https://github.com/blinkk/rootjs/tree/main/examples', 'examples')} on GitHub.`
        ),
        html(`<pre><code>my-site/
├── bundles/        # Client-side entry points
├── collections/    # CMS content models (*.schema.ts)
├── components/     # Shared TSX components
├── elements/       # Custom elements, loaded automatically
├── public/         # Static files, served as-is
├── routes/         # Pages, mapped to URLs by file path
├── translations/   # Translated strings ({locale}.json)
├── root-cms.d.ts   # Types generated from your schemas
└── root.config.ts  # Project configuration</code></pre>`)
      ),
      sections: [
        section('root-config', 'root.config.ts', [
          p(
            `The project's configuration, loaded by every ${c('root')} command. See ${a('/docs/config/', 'Configuration')}.`
          ),
        ]),
        section('routes', 'routes/', [
          p(
            `Each ${c('.tsx')} file in ${c('routes/')} is a page, and its path sets the URL, e.g. ${c('routes/about.tsx')} serves ${c('/about')}. The default export is rendered to HTML on the server. See ${a('/docs/routes/', 'Routes')}.`
          ),
        ]),
        section(
          'elements',
          'elements/',
          [
            p(
              `Root.js scans each rendered page for custom elements, and automatically adds the matching file from ${c('elements/')} to the page. Pages only load the JavaScript for the elements they use.`
            ),
            p('Define a custom element:'),
          ],
          [
            code(
              'tsx',
              `
// @/elements/custom-heading/custom-heading.ts

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'custom-heading': CustomHeadingProps;
    }
  }
}

interface CustomHeadingProps {...}

class CustomHeading extends HTMLElement {...}

window.customElements.define('custom-heading', CustomHeading);`
            ),
            copy(p('Use it in a route, with no import needed:')),
            code(
              'tsx',
              `
// @/routes/index.tsx

export default function Page() {
  return <custom-heading>Hello, world!</custom-heading>;
}`
            ),
            copy(p('Root.js adds the script to the rendered page:')),
            code(
              'html',
              `
<!-- rendered html -->
<!doctype html>
<html>
  <head>
    <script type="module" src="/elements/custom-heading/custom-heading.ts"></script>
  </head>
  <body>
    <custom-heading>Hello, world!</custom-heading>
  </body>
</html>`
            ),
            copy(
              p(`See ${a('/docs/islands/', 'Interactive islands')} for more.`)
            ),
          ]
        ),
        section(
          'bundles',
          'bundles/',
          [
            p(
              `Use ${c('bundles/')} for client-side code that isn't tied to a custom element, like analytics or third-party libraries. Bundles are built together with ${c('elements/')}, so shared dependencies are split into common chunks.`
            ),
          ],
          [
            code(
              'tsx',
              `
// @/routes/index.tsx

import {Script} from '@blinkk/root';

export default function Page() {
  return <Script type="module" src="/bundles/main.ts" />;
}`
            ),
          ]
        ),
        section('collections', 'collections/', [
          p(
            `CMS content models. Each ${c('.schema.ts')} file defines a collection, and ${c('root-cms generate-types')} writes matching TypeScript types to ${c('root-cms.d.ts')}. See ${a('/docs/cms/schemas/', 'Schemas')}.`
          ),
        ]),
        section(
          'translations',
          'translations/',
          [
            p(
              `Translated strings, one JSON file per locale, mapping each source string to its translation. See ${a('/docs/localization/', 'Localization')}.`
            ),
          ],
          [
            code(
              'json',
              `
// @/translations/es.json

{
  "Hello, world!": "¡Hola, mundo!",
  "Hello, {name}!": "¡Hola, {name}!"
}`
            ),
          ]
        ),
        section('public', 'public/', [
          p(
            `Static files served as-is from the site root, like ${c('robots.txt')}, favicons and site verification files.`
          ),
        ]),
      ],
    },
  },
};

const ROUTES: DocCopy = {
  slug: 'routes',
  note: 'Tightens the copy, adds catch-all routes to the table (and fixes its markup), and fixes bugs in the getStaticPaths() example.',
  fields: {
    meta: {
      title: 'Routes – Root.js',
      description:
        'How file-based routing works in Root.js, and how routes fetch data for SSG and SSR.',
      category: 'framework',
    },
    content: {
      title: 'Routes',
      body: richtext(
        p(
          `Root.js uses file-based routing. Each ${c('.tsx')} file in ${c('routes/')} is a page, and its path sets the URL. Square brackets mark URL params, and ${c('...')} marks a catch-all param that matches several path segments (double brackets make it optional).`
        ),
        html(ROUTES_TABLE)
      ),
      sections: [
        section(
          'page',
          'Page',
          [
            p(
              `A route's default export is its page component. It's rendered to HTML on the server, and sends no JavaScript to the browser.`
            ),
          ],
          [
            code(
              'tsx',
              `
// @/routes/index.tsx

export default function Page() {
  return <h1>Hello, world!</h1>;
}`
            ),
            copy(
              p(
                `To pass data to the page, export ${a('#getStaticProps', c('getStaticProps()'))} (for SSG) or ${a('#handle', c('handle()'))} (for SSR) from the route.`
              )
            ),
          ]
        ),
        section(
          'getStaticProps',
          'getStaticProps()',
          [
            p(
              `When a route exports ${c('getStaticProps()')}, the props it returns are passed to the page. For routes with params, like ${c('[slug].tsx')}, the param values are passed in the context.`
            ),
          ],
          [
            code(
              'tsx',
              `
// @/routes/blog/[slug].tsx

import {GetStaticProps} from '@blinkk/root';

export default function Page(props) {
  return <h1>{props.post.title}</h1>;
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  const post = await fetchPost(ctx.params.slug);
  return {props: {post}};
};`
            ),
          ]
        ),
        section(
          'getStaticPaths',
          'getStaticPaths()',
          [
            p(
              `To build a route with params as static HTML, Root.js needs to know every URL it serves. Export ${c('getStaticPaths()')} to return the list of params.`
            ),
          ],
          [
            code(
              'tsx',
              `
// @/routes/blog/[slug].tsx

import {GetStaticPaths} from '@blinkk/root';

export const getStaticPaths: GetStaticPaths = async () => {
  const slugs = await listPostSlugs();
  return {paths: slugs.map((slug) => ({params: {slug}}))};
};`
            ),
          ]
        ),
        section(
          'handle',
          'handle()',
          [
            p(
              `To render a route on each request (SSR), export a ${c('handle()')} function. It works like an Express request handler: read the request, then call ${c('ctx.render()')} with the page's props.`
            ),
          ],
          [
            code(
              'tsx',
              `
// @/routes/hello.tsx

import {Handler, HandlerContext} from '@blinkk/root';

export default function Page(props) {
  return <h1>Hello, {props.name}!</h1>;
}

export const handle: Handler = async (req, res) => {
  const ctx = req.handlerContext as HandlerContext;
  const name = req.query.name || 'world';
  return ctx.render({name});
};`
            ),
            copy(
              p(
                `Use ${c('root build --ssr-only')} to build a site that only uses SSR, and ${c('root start')} to serve it.`
              )
            ),
          ]
        ),
        section('404', '404.tsx', [
          p(
            `To customize the "not found" page, add ${c('routes/404.tsx')}. It's rendered when no other route matches a request, and when a ${c('handle()')} function calls ${c('ctx.render404()')}.`
          ),
        ]),
      ],
    },
  },
};

const ISLANDS: DocCopy = {
  slug: 'islands',
  note: 'Tightens the copy. The code examples are unchanged.',
  fields: {
    meta: {
      title: 'Interactive islands – Root.js',
      description:
        'Add interactivity to server-rendered pages with custom elements and Preact islands.',
      category: 'framework',
      navLabel: 'Interactive islands',
    },
    content: {
      title: 'Interactive islands',
      sections: [
        section('overview', 'Overview', [
          p(
            `Root.js pages are static HTML by default. To add interactivity, Root.js uses an ${a('https://jasonformat.com/islands-architecture/', 'islands architecture')} built on ${a('https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements', 'custom elements')}: only the interactive parts of a page load JavaScript.`
          ),
          p('It works like this:'),
          ol(
            'The page is rendered from TSX to HTML.',
            'Root.js scans the HTML for custom elements.',
            `For each one with a matching file in ${c('elements/**/&lt;tag&gt;.ts')}, Root.js adds that file to the page.`
          ),
        ]),
        section(
          'creating-custom-elements',
          'Create a custom element',
          [
            p(
              `You can write custom elements in plain TypeScript, or with a framework that compiles to them (e.g. ${a('https://preactjs.com/guide/v10/web-components/#creating-a-web-component', 'Preact')}, ${a('https://svelte.dev/docs/custom-elements-api', 'Svelte')} or ${a('https://vuejs.org/guide/extras/web-components#building-custom-elements-with-vue', 'Vue')}). This example uses plain TypeScript.`
            ),
            p(
              `Create a file named after the element's tag in ${c('elements/')}:`
            ),
          ],
          [
            code(
              'ts',
              `
// @/elements/root-counter.ts

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-counter': preact.JSX.HTMLAttributes;
    }
  }
}

class RootCounter extends HTMLElement {
  value = 0;

  connectedCallback() {
    const button = this.querySelector('button');
    const valueEl = this.querySelector('.value');
    if (button && valueEl) {
      button.addEventListener('click', () => {
        this.value += 1;
        valueEl.textContent = String(this.value);
      });
    }
  }
}

if (!customElements.get('root-counter')) {
  customElements.define('root-counter', RootCounter);
}`
            ),
            copy(
              p(
                `Then use the element in any page. There's nothing to import: Root.js detects it and adds the script.`
              )
            ),
            code(
              'tsx',
              `
// @/routes/index.tsx

export default function Page() {
  return (
    <root-counter>
      <button>Count</button>
      <div className="value">0</div>
    </root-counter>
  );
}`
            ),
          ]
        ),
        section(
          'preact-rehydration',
          'Hydrate Preact components',
          [
            p(
              `Root.js renders TSX with Preact on the server, but doesn't send Preact to the browser. To make a Preact component interactive, wrap it in a custom element that hydrates it on the client.`
            ),
            p(`First, create the element that does the hydrating:`),
          ],
          [
            code(
              'tsx',
              `
// @/elements/root-island.tsx

import {hydrate} from 'preact';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-island': preact.JSX.HTMLAttributes & {
        component: string;
        props?: string;
      };
    }
  }
}

const islands: Record<string, any> = {};
const islandsModules = import.meta.glob('/islands/**/*.tsx');
Object.entries(islandsModules).forEach(([moduleId, loader]) => {
  const componentName = moduleId.split('/')[2];
  islands[componentName] = loader;
});

class RootIsland extends HTMLElement {
  connectedCallback() {
    const componentName = this.getAttribute('component');
    if (!componentName) {
      return;
    }
    const propsAttr = this.getAttribute('props');
    const props = propsAttr ? JSON.parse(propsAttr) : {};
    this.rehydrate(componentName, props);
  }

  async rehydrate(componentName: string, props: any) {
    const loader = islands[componentName];
    if (loader) {
      const module = await loader();
      const Island = module[componentName];
      if (Island && Island.Component) {
        hydrate(<Island.Component {...props} />, this);
      }
    }
  }
}

if (!window.customElements.get('root-island')) {
  window.customElements.define('root-island', RootIsland);
}`
            ),
            copy(
              p(
                `Then add components to an ${c('islands/')} folder, wrapped in ${c('&lt;root-island&gt;')}:`
              )
            ),
            code(
              'tsx',
              `
// @/islands/Counter.tsx

import {useState} from 'preact/hooks';

export function Counter(props) {
  return (
    <root-island component="Counter" props={JSON.stringify(props)}>
      <Counter.Component {...props} />
    </root-island>
  );
}

Counter.Component = (props) => {
  const [value, setValue] = useState(0);

  function incr() {
    setValue((current) => current + 1);
  }

  return (
    <div className="counter">
      <button onClick={() => incr()}>Count</button>
      <div>{value}</div>
    </div>
  );
};`
            ),
            copy(
              p(
                `Use the component like any other. It's rendered on the server, then hydrated in the browser.`
              )
            ),
            code(
              'tsx',
              `
// @/routes/index.tsx

import {Counter} from '@/islands/Counter';

export default function Page() {
  return <Counter />;
}`
            ),
          ]
        ),
      ],
    },
  },
};

const LOCALIZATION: DocCopy = {
  slug: 'localization',
  note: 'Adds a section on translating CMS content, and a note on locale fallbacks.',
  fields: {
    meta: {
      title: 'Localization – Root.js',
      description:
        'Serve localized URLs and translate strings and CMS content in a Root.js project.',
      category: 'framework',
    },
    content: {
      title: 'Localization',
      body: richtext(
        p(
          `Root.js has built-in localization: locale-aware URLs, translated strings, and translations for CMS content, all managed in one place.`
        )
      ),
      sections: [
        section(
          'config',
          'Configuration',
          [
            p(
              `Set the site's locales and URL format with the ${c('i18n')} option in ${c('root.config.ts')}:`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  i18n: {
    locales: ['en', 'ja'],
    defaultLocale: 'en',
    urlFormat: '/[locale]/[path]',
  },
});`
            ),
            copy(
              p(
                `Each route is then served at a URL per locale, e.g. ${c('/ja/about')}. Use ${c('fallbacks')} to set which locales a missing translation falls back to.`
              )
            ),
          ]
        ),
        section(
          'translations',
          'Translations',
          [
            p(
              `Translated strings live in ${c('translations/')}, one JSON file per locale, mapping each source string to its translation:`
            ),
          ],
          [
            code(
              'json',
              `
// @/translations/fr.json

{
  "Hello, world!": "Bonjour le monde !",
  "Hello, {name}!": "Bonjour {name} !"
}`
            ),
          ]
        ),
        section(
          'useTranslations',
          'useTranslations()',
          [
            p(
              `${c('useTranslations()')} returns a function that translates a string into the current locale. Values in curly braces are replaced with the params you pass.`
            ),
          ],
          [
            code(
              'tsx',
              `
// @/routes/index.tsx

import {useTranslations} from '@blinkk/root';

export default function Page(props) {
  const t = useTranslations();
  if (props.name) {
    return <h1>{t('Hello, {name}!', {name: props.name})}</h1>;
  }
  return <h1>{t('Hello, world!')}</h1>;
}`
            ),
          ]
        ),
        section('cms-content', 'Translating CMS content', [
          p(
            `Schema fields marked with ${c('translate: true')} are sent for translation. Editors translate them in the CMS, with AI, or by exporting them to a spreadsheet or translation vendor.`
          ),
          p(
            `Translations are stored in the CMS, and loaded with ${c('cmsClient.loadTranslations()')}. Pass them to ${c('ctx.render()')} to use them with ${c('useTranslations()')}. See ${a('/docs/cms/data-fetching/#translations', 'Data fetching')}.`
          ),
        ]),
      ],
    },
  },
};

const CONFIG: DocCopy = {
  slug: 'config',
  note: 'Updates the Vite example for the modern Sass API (loadPaths), and adds sessionCookieSecret, sitemap and a link to the full config reference.',
  fields: {
    meta: {
      title: 'Configuration – Root.js',
      description: 'The most common options in root.config.ts.',
      category: 'framework',
    },
    content: {
      title: 'Configuration',
      body: richtext(
        p(
          `Every ${c('root')} command loads the project's ${c('root.config.ts')}. This page covers the most common options. For the full list, see ${c('RootUserConfig')} in the ${a('/docs/api/root/#blinkk-root-rootuserconfig', 'API reference')}.`
        )
      ),
      sections: [
        section(
          'base',
          'base',
          [p('A path prefix for every URL on the site.')],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  // The site serves at example.com/about/...
  base: '/about/',
});`
            ),
          ]
        ),
        section(
          'domain',
          'domain',
          [
            p(
              `The site's canonical domain, used for the sitemap, canonical URLs and other SEO tags.`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  domain: 'https://example.com',
});`
            ),
          ]
        ),
        section(
          'elements',
          'elements',
          [
            p(
              `Where Root.js looks for ${a('/docs/islands/', 'custom elements')}. By default, it looks in ${c('elements/')}. Add folders, e.g. from a shared design system, or exclude files.`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';

const rootDir = new URL('.', import.meta.url).pathname;
const designSystem = path.resolve(rootDir, '../../packages/designsystem');

export default defineConfig({
  elements: {
    include: [path.resolve(designSystem, './elements')],
  },
});`
            ),
          ]
        ),
        section(
          'i18n',
          'i18n',
          [
            p(
              `The site's locales and the URL format for localized pages. See ${a('/docs/localization/', 'Localization')}.`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  i18n: {
    locales: ['de', 'en', 'es', 'fr'],
    urlFormat: '/intl/[locale]/[base]/[path]',
  },
});`
            ),
          ]
        ),
        section(
          'server-redirects',
          'server.redirects',
          [p('Redirects served by the server.')],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  server: {
    redirects: [
      // Redirect /foo to /bar.
      {source: '/foo', destination: '/bar', type: 301},
    ],
  },
});`
            ),
          ]
        ),
        section(
          'server-session-cookie-secret',
          'server.sessionCookieSecret',
          [
            p(
              `The secret used to sign session cookies, e.g. for signing in to the CMS. Keep it out of source control, for example in an environment variable.`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  server: {
    sessionCookieSecret: process.env.SESSION_COOKIE_SECRET,
  },
});`
            ),
          ]
        ),
        section(
          'server-trailing-slash',
          'server.trailingSlash',
          [
            p(
              `By default, a page is served both with and without a trailing slash. Set ${c('trailingSlash')} to ${c('true')} to redirect URLs to add a trailing slash, or ${c('false')} to redirect URLs to remove it.`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  server: {
    // Enforce a trailing slash.
    trailingSlash: true,
  },
});`
            ),
          ]
        ),
        section('sitemap', 'sitemap', [
          p(
            `Set ${c('sitemap: true')} to add ${c('sitemap.xml')} to the build output, with ${c('hreflang')} links between localized pages. Set ${c('domain')} too, so the sitemap has full URLs.`
          ),
        ]),
        section(
          'vite',
          'vite',
          [
            p(
              `Settings passed to Vite. See ${a('https://vite.dev/config/', 'Configuring Vite')}.`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';

const rootDir = new URL('.', import.meta.url).pathname;

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: [path.resolve(rootDir, './styles')],
        },
      },
    },
  },
});`
            ),
          ]
        ),
      ],
    },
  },
};

const PLUGINS: DocCopy = {
  slug: 'plugins',
  note: 'Tightens the copy, and mentions that the CMS is itself a plugin.',
  fields: {
    meta: {
      title: 'Plugins – Root.js',
      description:
        'Extend the Root.js server and build with plugins in root.config.ts.',
      category: 'framework',
    },
    content: {
      title: 'Plugins',
      body: richtext(
        p(
          `Plugins hook into the Root.js server and build. They're added to the ${c('plugins')} list in ${c('root.config.ts')}. The CMS itself is a plugin (${c('cmsPlugin()')}), and you can write your own. For every hook, see ${c('Plugin')} in the ${a('/docs/api/root/#blinkk-root-plugin', 'API reference')}.`
        )
      ),
      sections: [
        section(
          'configureServer',
          'configureServer',
          [
            p(
              `A plugin's ${c('configureServer()')} hook receives the Express app, so it can add middleware. This plugin redirects ${c('/blog')} to another site, keeping the query string:`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';
import {blogRedirectPlugin} from './plugins/blog-redirect';

export default defineConfig({
  plugins: [blogRedirectPlugin()],
});`
            ),
            code(
              'ts',
              `
// @/plugins/blog-redirect.ts

import {NextFunction, Plugin, Request, Response} from '@blinkk/root';

/** Redirects \`/blog\` to \`https://blog.example.com\`. */
export function blogRedirectPlugin(): Plugin {
  return {
    name: 'blog-redirect',
    configureServer: (server) => {
      server.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/blog')) {
          const qIndex = req.originalUrl.indexOf('?');
          const query = qIndex === -1 ? '' : req.originalUrl.slice(qIndex);
          res.redirect(301, \`https://blog.example.com/\${query}\`);
          return;
        }
        next();
      });
    },
  };
}`
            ),
          ]
        ),
      ],
    },
  },
};

const CMS_CONFIGURATION: DocCopy = {
  slug: 'cms',
  note: 'Adds a "Setting up Firebase by hand" section with the manual steps that "Getting started" replaced with the `root-cms setup` wizard.',
  fields: {
    meta: {
      title: 'CMS configuration – Root.js',
      description:
        'Configure the Root.js CMS: plugin options, security rules and roles, Google APIs, AI and scheduled jobs.',
      category: 'cms',
      navLabel: 'Configuration',
    },
    content: {
      title: 'CMS configuration',
      body: richtext(
        p(
          `The CMS is added to a site with the ${c('cmsPlugin()')} plugin. To set it up for the first time, see ${a('/docs/#set-up-cms', 'Getting started')}. This page covers the options you're most likely to need.`
        )
      ),
      sections: [
        section(
          'plugin-options',
          'Plugin options',
          [
            p(
              `Only ${c('firebaseConfig')} is required. Common options include:`
            ),
            ul(
              `${c('id')}: namespaces the site's content in Firestore, so several sites can share one Firebase project. Defaults to ${c('default')}.`,
              `${c('name')}: the site name shown in the CMS.`,
              `${c('firebaseConfig')}: the web app config from the Firebase console.`,
              `${c('gapi')}: a Google API key and OAuth client id, for the Google Drive and Sheets features.`,
              `${c('ai')}: the models available to Root AI.`,
              `${c('isUserAuthorized')}: a custom check for whether a user can access the CMS.`
            ),
            p(
              `See ${c('CMSPluginOptions')} in the ${a('/docs/api/root-cms/#blinkk-root-cms-plugin-cmspluginoptions', 'API reference')} for every option.`
            ),
          ],
          [
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';
import {cmsPlugin} from '@blinkk/root-cms/plugin';

export default defineConfig({
  plugins: [
    cmsPlugin({
      id: 'my-site',
      name: 'My Site',
      firebaseConfig: {
        apiKey: '...',
        authDomain: 'my-project.firebaseapp.com',
        projectId: 'my-project',
        storageBucket: 'my-project.appspot.com',
      },
    }),
  ],
});`
            ),
          ]
        ),
        section(
          'manual-setup',
          'Setting up Firebase by hand',
          [
            p(
              `${c('root-cms setup')} does all of this for you (see ${a('/docs/#set-up-cms', 'Getting started')}). To set up a project by hand instead:`
            ),
            ol(
              `Create a project in the ${a('https://console.firebase.google.com/', 'Firebase console')}, or add Firebase to an existing Google Cloud project.`,
              `Create a Firestore database in <b>Native mode</b>.`,
              `Under <b>Authentication</b>, enable the <b>Google</b> sign-in provider. If your site will serve on a custom domain, add it to the authorized domains.`,
              `Under <b>Project settings</b>, register a web app and copy its ${c('firebaseConfig')} values into ${c('cmsPlugin()')}:`
            ),
          ],
          [
            code('ts', STARTER_FIREBASE_CONFIG),
            copy(
              p(
                `Before you deploy, also replace ${c('sessionCookieSecret')} with a long random value. The server reads and writes Firestore with ${a('https://cloud.google.com/docs/authentication/application-default-credentials', 'application default credentials')}; for local development, sign in with the gcloud CLI:`
              )
            ),
            code(
              'bash',
              `
gcloud auth login
gcloud auth application-default login`
            ),
            copy(
              p(
                `Finally, apply the security rules and add yourself as an admin, as described ${a('#security-rules', 'below')}.`
              )
            ),
          ]
        ),
        section(
          'security-rules',
          'Security rules and roles',
          [
            p(
              `Content access is controlled by Firestore security rules and a list of roles per site. The easiest way to set both up is with ${c('init-firebase')}, which applies the rules and makes you an ADMIN:`
            ),
          ],
          [
            code(
              'bash',
              'pnpm exec root-cms init-firebase --admin=you@example.com'
            ),
            copy(
              p(
                `To apply the rules by hand, paste them into the <b>Rules</b> tab of the Firestore page in the Firebase console:`
              )
            ),
            code('ts', FIRESTORE_RULES),
            copy(
              p(
                `Then, in Firestore, create a doc at ${c('Projects/&lt;id&gt;')} (where ${c('&lt;id&gt;')} is the plugin's ${c('id')}) with a ${c('roles')} map from your email to ${c('ADMIN')}. After that, manage users from the CMS's settings page.`
              ),
              p('The roles are:'),
              ul(
                `<b>ADMIN</b>: everything, including managing users and settings.`,
                `<b>EDITOR</b>: edit and publish content.`,
                `<b>CONTRIBUTOR</b>: edit drafts, but not publish.`,
                `<b>VIEWER</b>: read-only access.`
              ),
              p(
                `A role can be granted to a whole domain with an entry like ${c('*@example.com')}. Anyone with a verified email on that domain gets the role, so use it sparingly, never with a free email provider, and prefer per-email grants for ADMIN and EDITOR.`
              )
            ),
          ]
        ),
        section('google-apis', 'Google Drive and Sheets', [
          p(
            `Some CMS features, like importing from Google Sheets and Drive, use Google APIs on the editor's behalf. To enable them:`
          ),
          ol(
            `In the Google Cloud console, enable the Google Sheets API and Google Drive API.`,
            `Create an ${a('https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow', 'OAuth client id')} (web application) and an API key.`,
            `Pass them to the plugin as ${c('gapi: {clientId, apiKey}')}, e.g. from environment variables.`
          ),
        ]),
        section('ai', 'Root AI', [
          p(
            `Root AI lets editors chat with, draft and translate content in the CMS. Enable it with the ${c('ai')} option, listing the models editors can choose from and their API keys. See the ${a('/docs/migration/v3/#ai', 'v3 migration guide')} for an example.`
          ),
        ]),
        section(
          'cron-jobs',
          'Scheduled jobs',
          [
            p(
              `Scheduled publishing, version history and a few other features rely on a job that calls the ${c('/cms/api/cron.run')} endpoint every few minutes.`
            ),
            p(
              `<b>Firebase</b>: if your site is deployed to Cloud Functions for Firebase, export the ${c('cron')} function from ${c('@blinkk/root-cms/functions')}:`
            ),
          ],
          [
            code(
              'ts',
              `
// @/index.ts

import {server} from '@blinkk/root/functions';
import {cron} from '@blinkk/root-cms/functions';

export const www = {
  server: server({mode: 'production'}),
  cron: cron(),
};`
            ),
            copy(
              p(
                `<b>Other hosting</b>: on App Engine, Cloud Run or elsewhere, create a ${a('https://cloud.google.com/scheduler/docs/creating', 'Cloud Scheduler')} job that calls ${c('/cms/api/cron.run')} on your site every few minutes.`
              )
            ),
          ]
        ),
        section('credentials', 'Credentials in production', [
          p(
            `The server accesses Firestore with application default credentials. On Google Cloud (App Engine, Cloud Run, Cloud Functions), the runtime's service account is used, so give it access to Firestore. Elsewhere, set ${c('GOOGLE_APPLICATION_CREDENTIALS')} to a service account key file.`
          ),
        ]),
      ],
    },
  },
};

const SCHEMAS: DocCopy = {
  slug: 'cms--schemas',
  note: 'Replaces "Root CMS" with "the CMS", uses schema.glob() in the composition example, and links field types to the generated API reference.',
  fields: {
    meta: {
      title: 'Schemas – Root.js',
      description:
        'Define CMS collections and reusable content models in .schema.ts files.',
      category: 'cms',
    },
    content: {
      title: 'Schemas',
      sections: [
        section('overview', 'Overview', [
          p(
            `CMS content models are defined in code, in ${c('.schema.ts')} files. They're versioned with the rest of your site, type-checked by TypeScript, and used to generate types for your templates with ${c('root-cms generate-types')}.`
          ),
        ]),
        section(
          'creating-cms-collections',
          'Collections',
          [
            p(
              `A collection is a group of docs that share a schema, like blog posts or landing pages. To add one, create ${c('collections/&lt;Name&gt;.schema.ts')}:`
            ),
          ],
          [
            code(
              'ts',
              `
// @/collections/BlogPosts.schema.ts

import {schema} from '@blinkk/root-cms';

export default schema.collection({
  name: 'BlogPosts',
  description: 'Posts for the blog.',
  url: '/blog/[slug]',
  preview: {
    title: 'title',
    image: 'image',
  },
  fields: [
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
    }),
    schema.image({
      id: 'image',
      label: 'Image',
      help: 'Upload a 1600x900 JPG.',
    }),
    schema.richtext({
      id: 'content',
      label: 'Content',
      translate: true,
    }),
  ],
});`
            ),
            copy(
              p(
                `The ${c('url')} tells the CMS where each doc is served, for live preview and links.`
              )
            ),
          ]
        ),
        section(
          'composing-schemas',
          'Reusable schemas',
          [
            p(
              `Use ${c('schema.define()')} for content models that are used in more than one place, like page modules. ${c('schema.glob()')} collects every schema that matches a pattern, so adding a template file adds it to the CMS:`
            ),
          ],
          [
            code(
              'ts',
              `
// @/templates/TemplateHero/TemplateHero.schema.ts

import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateHero',
  fields: [
    schema.string({id: 'title', translate: true}),
    schema.richtext({id: 'body', translate: true}),
    schema.image({id: 'image'}),
  ],
});`
            ),
            code(
              'ts',
              `
// @/collections/Pages.schema.ts

import {schema} from '@blinkk/root-cms';

export default schema.collection({
  name: 'Pages',
  url: '/[...slug]',
  fields: [
    schema.array({
      id: 'modules',
      label: 'Modules',
      of: schema.oneOf({
        types: schema.glob('/templates/*/*.schema.ts'),
      }),
    }),
  ],
});`
            ),
            copy(
              p(
                `Each ${c('schema.define()')} name must be unique across the project.`
              )
            ),
          ]
        ),
        section('schema-field-types', 'Field types', [
          p(
            `Fields include ${c('string')}, ${c('richtext')}, ${c('image')}, ${c('file')}, ${c('select')}, ${c('multiselect')}, ${c('boolean')}, ${c('number')}, ${c('date')}, ${c('datetime')}, ${c('reference')}, ${c('object')}, ${c('array')} and ${c('oneOf')}. For every field and option, see ${c('schema')} in the ${a('/docs/api/root-cms/#blinkk-root-cms-schema', 'API reference')}.`
          ),
        ]),
      ],
    },
  },
};

const DATA_FETCHING: DocCopy = {
  slug: 'cms--data-fetching',
  note: 'Fixes bugs in the examples, and adds sections on custom ordering and translations.',
  fields: {
    meta: {
      title: 'Data fetching – Root.js',
      description:
        'Read CMS content in routes with RootCMSClient: docs, lists, custom ordering and translations.',
      category: 'cms',
    },
    content: {
      title: 'Data fetching',
      sections: [
        section(
          'overview',
          'Overview',
          [
            p(
              `Routes read CMS content on the server with ${c('RootCMSClient')}, in ${c('getStaticProps()')} (SSG) or ${c('handle()')} (SSR). Create a client with the ${c('rootConfig')} from the request or context.`
            ),
            p(
              `Every read takes a ${c('mode')}: ${c('published')} for live content, or ${c('draft')} for the latest edits. A common pattern is to read drafts when the URL has ${c('?preview=true')}, which the CMS adds to its preview links.`
            ),
          ],
          [
            code(
              'tsx',
              `
// @/routes/[...page].tsx

import {Handler, HandlerContext} from '@blinkk/root';
import {RootCMSClient} from '@blinkk/root-cms';

export const handle: Handler = async (req, res) => {
  const ctx = req.handlerContext as HandlerContext;
  const slug = ctx.params.page;
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const cmsClient = new RootCMSClient(req.rootConfig);
  const doc = await cmsClient.getDoc('Pages', slug, {mode});
  if (!doc) {
    return ctx.render404();
  }
  return ctx.render({slug, mode, doc});
};`
            ),
          ]
        ),
        section(
          'listing-docs',
          'Listing docs',
          [p(`To list the docs in a collection, use ${c('listDocs()')}:`)],
          [
            code(
              'ts',
              `
const cmsClient = new RootCMSClient(req.rootConfig);
const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
const orderBy = mode === 'draft' ? 'sys.createdAt' : 'sys.firstPublishedAt';
const blogPosts = await cmsClient.listDocs('BlogPosts', {
  mode,
  orderBy,
  orderByDirection: 'desc',
});`
            ),
          ]
        ),
        section(
          'custom-order',
          'Custom order',
          [
            p(
              `Collections with ${c('customSorting: true')} let editors drag docs into order in the CMS. The order is stored at ${c('sys.sortKey')}:`
            ),
          ],
          [
            code(
              'ts',
              `
const res = await cmsClient.listDocs('Guides', {
  mode,
  orderBy: 'sys.sortKey',
});`
            ),
            copy(
              p(
                `Ordering by ${c('sys.sortKey')} leaves out docs that don't have a position yet, e.g. ones created by a script.`
              )
            ),
          ]
        ),
        section(
          'translations',
          'Translations',
          [
            p(
              `Translations for CMS content are tagged with the doc they belong to. Load them with ${c('loadTranslations()')}, then pass the ones for the current locale to ${c('ctx.render()')}:`
            ),
          ],
          [
            code(
              'ts',
              `
import {translationsForLocale} from '@blinkk/root-cms';

const translationsMap = await cmsClient.loadTranslations({
  tags: ['common', \`Pages/\${slug}\`],
});
const translations = translationsForLocale(translationsMap, locale);
return ctx.render({doc}, {locale, translations});`
            ),
          ]
        ),
      ],
    },
  },
};

const CLI: DocCopy = {
  slug: 'cli',
  note: 'Replaces the hand-written command list with a reference generated from the CLI source code (see docs/scripts/generate_reference.ts).',
  fields: {
    meta: {
      title: 'CLI reference – Root.js',
      description:
        'Every command and option in the create-root, root, root-cms and root-password-protect CLIs.',
      category: 'reference',
    },
    content: {
      title: 'CLI reference',
      body: richtext(
        p(
          `Root.js ships a few command-line tools. Run them with ${c('pnpm exec')} (or through a ${c('package.json')} script) from your project directory:`
        ),
        ul(
          `${c('create-root')}: scaffolds a new project (${c('pnpm create @blinkk/root')}).`,
          `${c('root')}: runs, builds and deploys the site.`,
          `${c('root-cms')}: sets up the CMS, generates types, and reads and writes content.`,
          `${c('root-password-protect')}: tools for password-protected pages.`
        ),
        p(`This reference is generated from the source code.`)
      ),
      reference: 'cli',
      sections: [],
    },
  },
};

const API: DocCopy = {
  slug: 'api',
  note: 'Replaces the "in progress" placeholder with an overview of the packages, each with a generated reference page.',
  fields: {
    meta: {
      title: 'API reference – Root.js',
      description: 'The public packages and entry points of Root.js.',
      category: 'reference',
      navLabel: 'API overview',
    },
    content: {
      title: 'API reference',
      body: richtext(
        p(
          `Root.js is published as a few npm packages. Each package has a reference page, generated from its TypeScript types and doc comments:`
        ),
        ul(
          `${a('/docs/api/root/', c('@blinkk/root'))}: the framework, including config, routing, components, hooks and the server.`,
          `${a('/docs/api/root-cms/', c('@blinkk/root-cms'))}: the CMS, including the plugin, schemas, ${c('RootCMSClient')} and rich text rendering.`,
          `${a('/docs/api/root-password-protect/', c('@blinkk/root-password-protect'))}: password-protected pages.`
        )
      ),
      sections: [],
    },
  },
};

function apiPackageDoc(
  slugSuffix: string,
  packageName: string,
  description: string
): DocCopy {
  return {
    slug: `api--${slugSuffix}`,
    note: `New page: the generated API reference for ${packageName}.`,
    fields: {
      meta: {
        title: `${packageName} API – Root.js`,
        description,
        category: 'reference',
        navLabel: packageName,
      },
      content: {
        title: packageName,
        body: richtext(
          p(
            `${description} This reference is generated from the package's TypeScript types and doc comments.`
          )
        ),
        reference: `api-${slugSuffix}`,
        sections: [],
      },
    },
  };
}

const MIGRATION_V3: DocCopy = {
  slug: 'migration--v3',
  note: 'Adds the Node 24 requirement, fixes typos, and replaces "Root CMS" with "the CMS".',
  fields: {
    meta: {
      title: 'Migrating to Root.js v3 – Root.js',
      description:
        'Breaking changes and tips for updating a project to Root.js v3.',
      category: 'migration',
      navLabel: 'Migrating to v3',
    },
    content: {
      title: 'Migrating to Root.js v3',
      body: richtext(
        p(
          `Root.js v3 updates its main dependencies to their latest versions, including ${a('https://vite.dev/blog/announcing-vite8', 'Vite 8')}, which replaces ${a('https://rollupjs.org/', 'Rollup')} with ${a('https://rolldown.rs/', 'Rolldown')}, a bundler written in Rust. Root AI has also graduated from "experimental", with new config options.`
        )
      ),
      sections: [
        section('node', 'Node.js 24', [
          p(`<i>Applies to v3.3.1 and above</i>`),
          p(
            `Root.js requires ${a('https://nodejs.org/', 'Node.js')} 24 (the current LTS) or later. Update your local Node.js version, CI, and your hosting runtime, e.g. ${c('runtime: nodejs24')} in App Engine's ${c('app.yaml')}.`
          ),
        ]),
        section(
          'vite',
          'Vite config updates',
          [
            p(`<i>Applies to v3.0.0 and above</i>`),
            p(
              `${a('https://vite.dev/', 'Vite')} has been updated to v8. See Vite's ${a('https://vite.dev/guide/migration', 'migration guide')} for details.`
            ),
          ],
          [
            copy(
              p(
                `Root.js renames ${c('rollupOptions')} to ${c('rolldownOptions')} for you, but editors like VS Code show a deprecation warning. To migrate, rename the option:`
              ),
              p('⏪ Before:')
            ),
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  vite: {
    build: {rollupOptions: {...}},
  },
});`
            ),
            copy(p('⏩ After:')),
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  vite: {
    build: {rolldownOptions: {...}},
  },
});`
            ),
          ]
        ),
        section(
          'ai',
          'Root AI config',
          [
            p(
              `The Root AI config has graduated from "experimental". The new format supports more model providers.`
            ),
          ],
          [
            copy(p('⏪ Before:')),
            code(
              'ts',
              `
cmsPlugin({
  experiments: {ai: true},
});`
            ),
            copy(p('⏩ After:')),
            code(
              'ts',
              `
cmsPlugin({
  ai: {
    defaultModel: 'gemini-3.5-flash',
    models: [
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7',
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        capabilities: {tools: true, reasoning: true, attachments: true},
      },
      {
        id: 'gemini-3.5-flash',
        label: 'Gemini 3.5 Flash',
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY,
        capabilities: {tools: true, reasoning: true, attachments: true},
      },
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        capabilities: {tools: true, reasoning: true, attachments: true},
      },
    ],
  },
});`
            ),
          ]
        ),
        section('other', 'Other issues', [
          p(
            `Found an issue that isn't covered here? ${a('https://github.com/blinkk/rootjs/issues', 'File an issue')} on GitHub.`
          ),
        ]),
      ],
    },
  },
};

const MIGRATION_V2: DocCopy = {
  slug: 'migration--v2',
  note: 'Renames "Root CMS updates" to "CMS updates" and tightens the copy. The code examples are unchanged.',
  fields: {
    meta: {
      title: 'Migrating to Root.js v2 – Root.js',
      description:
        'Breaking changes and tips for updating a project to Root.js v2.',
      category: 'migration',
      navLabel: 'Migrating to v2',
    },
    content: {
      title: 'Migrating to Root.js v2',
      body: richtext(
        p(
          `Root.js v2 updates third-party dependencies, including Vite, Express, Sass and esbuild. Keep the following in mind when you update a project.`
        )
      ),
      sections: [
        section('node', 'Node.js updates', [
          p(`<i>Applies to v2.0.0 and above</i>`),
          p(
            `Support for non-LTS versions of ${a('https://nodejs.org/', 'Node.js')} has been dropped. Root.js v2 requires Node.js 20 or later. (Root.js v3 requires Node.js 24, see the ${a('/docs/migration/v3/#node', 'v3 migration guide')}.)`
          ),
        ]),
        section(
          'vite',
          'Vite config updates',
          [
            p(`<i>Applies to v2.2.0 and above</i>`),
            p(
              `${a('https://vite.dev/', 'Vite')} has been updated to v7. See Vite's ${a('https://vite.dev/guide/migration.html', 'migration guide')} for details.`
            ),
          ],
          [
            copy(
              p(
                `Vite no longer supports the legacy Sass API. Root.js converts old settings for you, but you should rename ${c('includePaths')} to ${c('loadPaths')} in ${c('root.config.ts')}:`
              ),
              p('⏪ Before:')
            ),
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          includePaths: [/* scss paths */],
        },
      },
    },
  },
});`
            ),
            copy(p('⏩ After:')),
            code(
              'ts',
              `
// @/root.config.ts

import {defineConfig} from '@blinkk/root';

export default defineConfig({
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: [/* scss paths */],
        },
      },
    },
  },
});`
            ),
          ]
        ),
        section(
          'sass',
          'Sass updates',
          [
            p(`<i>Applies to v2.2.0 and above</i>`),
            p(
              `Sass has been updated to the latest ${a('https://www.npmjs.com/package/sass-embedded', 'sass-embedded')} (v1.92.0 at the time of writing), which has several ${a('https://sass-lang.com/documentation/breaking-changes/', 'breaking changes')}.`
            ),
          ],
          [
            copy(
              p(
                `In particular, the way Sass handles mixed declarations has changed, which can change the order of your CSS output:`
              ),
              p('⏪ Before:')
            ),
            code(
              'ts',
              `
/* SCSS input */
.example {
  color: red;
  &--serious {
    font-weight: bold;
  }
  font-weight: normal;
}

/* CSS output */
.example {
  color: red;
  font-weight: normal;
}
.example--serious {
  font-weight: bold;
}`
            ),
            copy(p('⏩ After:')),
            code(
              'ts',
              `
/* SCSS input */
.example {
  color: red;
  &--serious {
    font-weight: bold;
  }
  font-weight: normal;
}

/* CSS output */
.example {
  color: red;
}
.example--serious {
  font-weight: bold;
}
.example {
  font-weight: normal;
}`
            ),
          ]
        ),
        section(
          'root-cms',
          'CMS updates',
          [
            p(`<i>Applies to v2.2.0 and above</i>`),
            p(
              `Much of the CMS UI was rewritten to perform better on large projects, which required a breaking change: every ${c('schema.define()')} name must now be unique across the project. This reduces the size of the schemas sent to the CMS and of ${c('root-cms.d.ts')}.`
            ),
          ],
          [
            copy(p('❌ Bad:')),
            code(
              'ts',
              `
/* @/components/A.schema.ts */
const Image = schema.define({
  name: 'Image',
  fields: [...],
});
export default schema.define(...);

/* @/components/B.schema.ts */
const Image = schema.define({
  name: 'Image',
  fields: [...],
});
export default schema.define(...);`
            ),
            copy(p('✅ Good:')),
            code(
              'ts',
              `
/* @/components/Image.schema.ts */
export default schema.define({
  name: 'Image',
  fields: [...],
});

/* @/components/A.schema.ts */
import Image from './Image.schema.ts';
export default schema.define(...);

/* @/components/B.schema.ts */
import Image from './Image.schema.ts';
export default schema.define(...);`
            ),
          ]
        ),
        section('other', 'Other issues', [
          p(
            `Found an issue that isn't covered here? ${a('https://github.com/blinkk/rootjs/issues', 'File an issue')} on GitHub.`
          ),
        ]),
      ],
    },
  },
};

const DEPLOYMENT: DocCopy = {
  slug: 'deployment',
  note: 'New page: deploying a site to production, as static HTML (SSG) or with a server (SSR) on App Engine or Firebase Hosting.',
  fields: {
    meta: {
      title: 'Deployment – Root.js',
      description:
        'Deploy a Root.js site to production as static HTML, or with a server on App Engine or Firebase Hosting.',
      category: 'start',
    },
    content: {
      title: 'Deployment',
      body: richtext(
        p(`Root.js sites can be deployed in one of two ways:`),
        ul(
          `<b>Static (SSG)</b>: ${c('root build')} renders every page to HTML ahead of time. Host the output on any static host or CDN.`,
          `<b>Server (SSR)</b>: pages are rendered on each request by a Node.js server. Root.js packages the server for ${a('#app-engine', 'App Engine')} and ${a('#firebase', 'Firebase Hosting')}, and it runs anywhere Node.js 24 does.`
        ),
        p(
          `Use SSR if your site uses the CMS: editors sign in to the CMS, preview drafts and publish on the running server. Also use SSR for any route that exports ${c('handle()')}, since those routes are skipped in a static build.`
        )
      ),
      sections: [
        section(
          'test-locally',
          'Test a production build locally',
          [
            p(
              `Before deploying, build the site and serve the output locally. ${c('root preview')} shows detailed error pages, and ${c('root start')} runs the production server that SSR deployments use.`
            ),
          ],
          [
            code(
              'bash',
              `
# Build the server and client assets, without pre-rendering pages.
pnpm exec root build --ssr-only

# Serve the build at http://localhost:4007.
pnpm exec root preview`
            ),
          ]
        ),
        section(
          'ssg',
          'Static (SSG)',
          [
            p(
              `${c('root build')} renders every page to ${c('dist/html/')}, along with the client assets and the files in ${c('public/')}:`
            ),
          ],
          [
            code('bash', 'pnpm exec root build'),
            copy(
              p('A page is rendered when its route:'),
              ul(
                `has no URL params, e.g. ${c('routes/about.tsx')}, and doesn't only export ${c('handle()')}; or`,
                `has params and exports ${a('/docs/routes/#getStaticPaths', c('getStaticPaths()'))}, which lists the values to render.`
              ),
              p(
                `Each page is written as ${c('index.html')} in a folder for its URL, e.g. ${c('dist/html/about/index.html')}, and ${c('routes/404.tsx')} is written to ${c('dist/html/404.html')}. With ${c('sitemap: true')} in ${c('root.config.ts')}, the build also writes ${c('sitemap.xml')}.`
              ),
              p(
                `Then upload ${c('dist/html/')} to your host. For example, with ${a('https://firebase.google.com/docs/hosting', 'Firebase Hosting')}:`
              )
            ),
            code(
              'json',
              `
// @/firebase.json

{
  "hosting": {
    "public": "dist/html",
    "ignore": ["firebase.json", "**/.*"]
  }
}`
            ),
            code(
              'bash',
              `
pnpm exec root build
firebase deploy --only hosting`
            ),
            copy(
              p(
                `Large sites can speed up builds with ${c('--concurrency')} and ${c('--threads')}, or rebuild part of a site with ${c('--filter')}, a regex matched against URL paths. See the ${a('/docs/cli/#root-build', 'CLI reference')}.`
              )
            ),
          ]
        ),
        section(
          'app-engine',
          'Server (SSR) on App Engine',
          [
            p(
              `The ${c('starter')} template is set up for ${a('https://cloud.google.com/appengine/docs/standard', 'App Engine')}, with a staging and a production ${c('app.yaml')}:`
            ),
          ],
          [
            code(
              'bash',
              `
# @/app.prod.yaml

runtime: nodejs24
instance_class: F2
service: default

handlers:
- url: /.*
  secure: always
  redirect_http_response_code: 301
  script: auto`
            ),
            copy(
              p(
                `<b>1. Package the site.</b> ${c('root create-package')} builds the site in SSR mode and writes a self-contained app to the output folder: the build, your ${c('collections/')}, the ${c('app.yaml')}, and a ${c('package.json')} with your dependencies and a ${c('start')} script. In a monorepo, dependencies from other workspace packages are included too.`
              )
            ),
            code(
              'bash',
              'pnpm exec root create-package --target=appengine --out=gae-prod --app-yaml=app.prod.yaml'
            ),
            copy(
              p(
                `<b>2. Deploy it.</b> ${c('root gae-deploy')} deploys the app as a new version with ${c('gcloud')}. With ${c('--promote')}, it sends all traffic to the new version once it's deployed. Without it, the version gets its own URL, which is useful for staging.`
              )
            ),
            code(
              'bash',
              `
pnpm exec root gae-deploy gae-prod/ \\
  --project=my-project \\
  --promote \\
  --healthcheck-url=/ \\
  --max-versions=10`
            ),
            copy(
              p(
                `${c('--healthcheck-url')} checks that the new version responds with a 200 before promoting it, and ${c('--max-versions')} deletes old versions so you stay under App Engine's limits. The ${c('starter')} template wraps both steps in ${c('pnpm stage')} and ${c('pnpm deploy')}.`
              ),
              p(
                `<b>Environment variables.</b> Set them in ${c('env_variables')} in ${c('app.yaml')}. To keep secrets out of the file, use a ${c("'{NAME}'")} placeholder, and ${c('gae-deploy')} fills it in from the environment it runs in:`
              )
            ),
            code(
              'bash',
              `
# @/app.prod.yaml

env_variables:
  SESSION_COOKIE_SECRET: '{SESSION_COOKIE_SECRET}'`
            ),
            copy(
              p(
                `<b>CMS scheduled jobs.</b> The CMS needs a job that calls ${c('/cms/api/cron.run')} every minute. On App Engine, add a ${c('cron.yaml')} and deploy it once with ${c('gcloud app deploy cron.yaml --project=my-project')}:`
              )
            ),
            code(
              'bash',
              `
# @/cron.yaml

cron:
- description: CMS scheduled jobs
  url: /cms/api/cron.run
  schedule: every 1 minutes`
            ),
          ]
        ),
        section(
          'firebase',
          'Server (SSR) on Firebase Hosting',
          [
            p(
              `On ${a('https://firebase.google.com/docs/hosting', 'Firebase Hosting')}, static files are served from the CDN and every other request is sent to a Cloud Function that runs the Root.js server. This site, rootjs.dev, is deployed this way.`
            ),
            p(
              `<b>1. Export the functions.</b> Add an ${c('index.ts')} to the project that exports the server, and the CMS's scheduled jobs if you use the CMS:`
            ),
          ],
          [
            code(
              'ts',
              `
// @/index.ts

import {server} from '@blinkk/root/functions';
import {cron} from '@blinkk/root-cms/functions';

export const www = {
  server: server({
    mode: 'production',
    // Options for the Cloud Function, e.g. to keep an instance warm.
    httpsOptions: {minInstances: 1},
  }),
  cron: cron(),
};`
            ),
            copy(
              p(
                `Add ${c('firebase-functions')} and ${c('firebase-admin')} to your dependencies, and set ${c('"main": "index.js"')} and ${c('"engines": {"node": "24"}')} in your ${c('package.json')}. These are copied into the packaged function.`
              ),
              p(
                `<b>2. Configure Firebase Hosting.</b> Serve static files from the packaged build, and rewrite every other request to the server function:`
              )
            ),
            code(
              'json',
              `
// @/firebase.json

{
  "hosting": {
    "public": "functions/dist/html",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {"source": "**", "function": "www-server", "pinTag": true}
    ]
  },
  "functions": [
    {
      "source": "functions",
      "ignore": ["node_modules", ".git", "*.local"]
    }
  ]
}`
            ),
            copy(
              p(
                `<b>3. Package and deploy.</b> ${c('root create-package --target=firebase')} builds the site in SSR mode. When the output folder is named ${c('functions')}, it also compiles ${c('index.ts')} into it.`
              )
            ),
            code(
              'bash',
              `
pnpm exec root create-package --target=firebase --out=functions
firebase deploy --only hosting,functions`
            ),
            copy(
              p(
                `<b>Environment variables.</b> Cloud Functions loads a ${c('.env')} file from the functions folder, so copy yours in after packaging, e.g. ${c('cp .env functions/')}. Don't commit it.`
              )
            ),
          ]
        ),
        section(
          'other-hosts',
          'Other Node.js hosts',
          [
            p(
              `To run the server somewhere else, like Cloud Run or a container, build in SSR mode and start the production server. It listens on the ${c('PORT')} environment variable (default ${c('4007')}).`
            ),
          ],
          [
            code(
              'bash',
              `
pnpm exec root build --ssr-only
pnpm exec root start --host=0.0.0.0`
            ),
          ]
        ),
        section('cms-checklist', 'Checklist for sites with the CMS', [
          ul(
            `<b>Credentials</b>: the server accesses Firestore with application default credentials. On App Engine and Cloud Functions, give the runtime's service account access to Firestore (e.g. the Cloud Datastore User role).`,
            `<b>Sign-in</b>: add your production domain to the authorized domains under Authentication in the Firebase console.`,
            `<b>Session cookies</b>: set ${a('/docs/config/#server-session-cookie-secret', c('server.sessionCookieSecret'))} from a secret, not a value in source control.`,
            `<b>Scheduled jobs</b>: schedule ${c('/cms/api/cron.run')} as shown above, or scheduled publishing and version history won't run. See ${a('/docs/cms/#cron-jobs', 'Scheduled jobs')}.`,
            `<b>Secrets</b>: to share secrets between developers and CI, see ${a('/docs/#secrets', c('root secrets'))}.`
          ),
        ]),
      ],
    },
  },
};

/** Every doc with refreshed copy, in sidebar order. */
export const DOCS_COPY: DocCopy[] = [
  GETTING_STARTED,
  PROJECT_STRUCTURE,
  DEPLOYMENT,
  ROUTES,
  ISLANDS,
  LOCALIZATION,
  CONFIG,
  PLUGINS,
  CMS_CONFIGURATION,
  SCHEMAS,
  DATA_FETCHING,
  CLI,
  API,
  apiPackageDoc(
    'root',
    '@blinkk/root',
    'The Root.js framework: config, routing, components, hooks and the server.'
  ),
  apiPackageDoc(
    'root-cms',
    '@blinkk/root-cms',
    'The Root.js CMS: the plugin, schemas, RootCMSClient and rich text rendering.'
  ),
  apiPackageDoc(
    'root-password-protect',
    '@blinkk/root-password-protect',
    'Password-protected pages for Root.js sites.'
  ),
  MIGRATION_V3,
  MIGRATION_V2,
];

/**
 * Sidebar order, applied with `propose_docs_copy.ts --assign-order`. Docs are
 * grouped by category in the sidebar, so this only sets the order within each
 * category.
 */
export const DOCS_ORDER: string[] = DOCS_COPY.map((doc) => doc.slug);
