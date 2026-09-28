/**
 * @fileoverview Copy and layout for the redesigned rootjs.dev landing page,
 * staged at `Sandbox/index`. Written to the CMS by `seed_sandbox_index.ts`.
 *
 * The page merges the old "web development tool" (/) and "CMS plugin"
 * (/products/cms) pages into a single story: Root.js as a web platform. The
 * feature ranking and alternate taglines are in `docs/redesign/README.md`.
 */

import type {ScreenshotEntry, ScreenshotsMap} from '../screenshots/types.ts';

/** Rich text value as stored by `schema.richtext()` fields. */
interface RichTextValue {
  blocks: Array<{type: 'paragraph'; data: {text: string}}>;
  time: number;
  version: string;
}

/** Builds a rich text value from one or more paragraphs of inline HTML. */
function richtext(...paragraphs: string[]): RichTextValue {
  return {
    blocks: paragraphs.map((text) => ({type: 'paragraph', data: {text}})),
    time: Date.now(),
    version: '2.28.2',
  };
}

function button(label: string, href: string, variant = 'primary') {
  return {options: [`variant:${variant}`], label, href};
}

function list(...items: string[]) {
  return items.map((text) => ({text}));
}

/** Scene id → screenshot, or an empty image when it hasn't been uploaded. */
function image(screenshots: ScreenshotsMap, id: string) {
  const entry: ScreenshotEntry | undefined = screenshots[id];
  if (!entry) {
    return undefined;
  }
  return {
    src: entry.src,
    width: entry.width,
    height: entry.height,
    alt: entry.alt,
  };
}

const SCHEMA_EXAMPLE = `import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateHero',
  fields: [
    schema.string({id: 'title', translate: true}),
    schema.richtext({id: 'body'}),
    schema.image({id: 'image'}),
  ],
});`;

const TEMPLATE_EXAMPLE = `import {RichText} from '@blinkk/root-cms/richtext';
import {TemplateHeroFields} from '@/root-cms.js';

// Props are typed from your schema.
export function TemplateHero(
  props: TemplateHeroFields
) {
  return (
    <section>
      <h1>{props.title}</h1>
      <RichText data={props.body} />
      <Image {...props.image} />
    </section>
  );
}`;

const ROUTE_EXAMPLE = `import {cmsRoute} from '@/utils/cms-route.js';
import {Page} from '@/components/Page.js';

export default Page;

// Drafts for editors, published for everyone.
export const {handle} = cmsRoute({
  collection: 'Pages',
  slugParam: 'page',
});`;

/** Returns the `fields` for the `Sandbox/index` doc. */
export function buildSandboxIndexFields(screenshots: ScreenshotsMap) {
  return {
    meta: {
      title: 'Root.js – The web platform for modern websites',
      description:
        'Root.js pairs a fast, TypeScript-first web framework with a collaborative CMS, so developers and content teams can build, edit, localize and ship websites together.',
      image: image(screenshots, 'cms-editor-preview'),
    },
    content: {
      modules: [
        // 1. Hero: the platform pitch, with live preview (feature #1) as the
        // product shot.
        {
          _type: 'TemplateHero',
          id: 'hero',
          eyebrow: 'Root.js · The web platform',
          title: 'Build the site. Run the content. Ship it together.',
          body: richtext(
            'Root.js pairs a fast, TypeScript-first web framework with a CMS your whole team will actually enjoy: live preview, AI, localization and publishing workflows, all built in.'
          ),
          buttons: [
            button('Get started', '/guide/'),
            button(
              'View on GitHub',
              'https://github.com/blinkk/rootjs',
              'outline'
            ),
          ],
          command: 'npm create @blinkk/root',
          image: image(screenshots, 'cms-editor-preview'),
        },

        // 2. The three parts of the platform.
        {
          _type: 'TemplatePillars',
          id: 'platform',
          options: ['theme:tint'],
          eyebrow: 'One platform',
          title: 'From first commit to final publish.',
          body: 'Most teams stitch together a framework, a headless CMS, a translation tool and a deploy pipeline. Root.js is all of it, designed to work as one.',
          pillars: [
            {
              icon: 'code',
              eyebrow: 'Build',
              title: 'A framework that gets out of your way.',
              body: 'Server-rendered TSX, file-based routes and web-component islands, powered by Vite.',
              bullets: list(
                'Zero client JavaScript by default',
                'i18n routing and sitemaps built in',
                'Deploy to Firebase or App Engine'
              ),
              link: {label: 'Read the guide', href: '/guide/'},
            },
            {
              icon: 'preview',
              eyebrow: 'Manage',
              title: 'A CMS your editors will love.',
              body: 'Visual editing with live preview, drafts, releases, translations and comments, on top of your own Firestore.',
              bullets: list(
                'Content models defined in code',
                'Schedule launches with releases',
                'Roles, locks and version history'
              ),
              link: {label: 'Explore the CMS', href: '#features'},
            },
            {
              icon: 'ai',
              eyebrow: 'Automate',
              title: 'AI that knows your content.',
              body: 'Root AI and agent tooling can read, edit, translate and publish with your team, and your team stays in charge.',
              bullets: list(
                'Chat with your content in the CMS',
                'Bring your own model provider',
                'Agent changes reviewed like PRs'
              ),
              link: {label: 'Meet Root AI', href: '#root-ai'},
            },
          ],
        },

        // 3. Feature #2: Root AI.
        {
          _type: 'TemplateFeatureSpotlight',
          id: 'root-ai',
          eyebrow: 'Root AI',
          title: 'An AI teammate that knows your content model.',
          body: richtext(
            'Ask Root AI to find, draft, translate or restructure content. It works through the same tools your editors use, so every change lands as a reviewable draft.'
          ),
          highlights: list(
            'Reads and edits docs, schemas and releases',
            'Read-only, approve-each-step or auto modes',
            'Anthropic, OpenAI, Google or any OpenAI-compatible model'
          ),
          image: image(screenshots, 'cms-root-ai'),
        },

        // 4. Feature #3: schema-as-code.
        {
          _type: 'TemplateCodeShowcase',
          id: 'schemas',
          options: ['theme:tint'],
          eyebrow: 'Content as code',
          title: 'Your content model lives in your repo.',
          body: 'Define schemas in TypeScript, get generated types for free, and render content with the same components you already write.',
          files: [
            {
              filename: 'templates/TemplateHero/TemplateHero.schema.ts',
              caption: 'Describe the fields editors can fill in.',
              language: 'ts',
              code: SCHEMA_EXAMPLE,
            },
            {
              filename: 'templates/TemplateHero/TemplateHero.tsx',
              caption: 'Render them with fully typed props.',
              language: 'tsx',
              code: TEMPLATE_EXAMPLE,
            },
            {
              filename: 'routes/[[...page]].tsx',
              caption: 'Map a collection to a route.',
              language: 'tsx',
              code: ROUTE_EXAMPLE,
            },
          ],
        },

        // 5. Feature #4: publishing workflow.
        {
          _type: 'TemplateFeatureSpotlight',
          id: 'publishing',
          options: ['layout:image-left'],
          eyebrow: 'Publishing',
          title: 'Ship content like you ship code.',
          body: richtext(
            'Work in drafts, then publish now, on a schedule, or as part of a release that goes live all at once. Publishing checks catch problems before your visitors do.'
          ),
          highlights: list(
            'Drafts, diffs and AI-written publish messages',
            'Releases bundle docs and data for launch day',
            'Custom checks for translations, links and more'
          ),
          image: image(screenshots, 'cms-publish-checks'),
        },

        // 6. Feature #5: localization.
        {
          _type: 'TemplateFeatureSpotlight',
          id: 'localization',
          options: ['theme:tint'],
          eyebrow: 'Localization',
          title: 'Every locale, one workflow.',
          body: richtext(
            'Root.js tracks every translatable string from schema to page. Translate in the CMS, with AI, or through your vendor, and localized URLs, fallbacks and hreflang tags come for free.'
          ),
          highlights: list(
            'Per-page translation editor with missing-string alerts',
            'Import and export CSV, Google Sheets and ARB',
            'Plug in providers like Crowdin'
          ),
          image: image(screenshots, 'cms-translations'),
        },

        // 7. Feature #6: collaboration.
        {
          _type: 'TemplateFeatureSpotlight',
          id: 'collaboration',
          options: ['layout:image-left'],
          eyebrow: 'Collaboration',
          title: 'Feedback right where the words live.',
          body: richtext(
            'Comment on any field, @mention a teammate and resolve threads when you’re done. See who else is editing, and get notified when it matters.'
          ),
          highlights: list(
            'Field-level comment threads with @mentions',
            'Live presence avatars on every doc',
            'Email and custom notification hooks'
          ),
          image: image(screenshots, 'cms-field-comments'),
        },

        // 8. Features #7-#14.
        {
          _type: 'TemplateFeatureGrid',
          id: 'features',
          options: ['columns:4'],
          eyebrow: 'And so much more',
          title: 'Everything your content team needs.',
          items: [
            {
              icon: 'history',
              title: 'Version history',
              body: 'Every change, recoverable. Compare, restore or copy any past version.',
            },
            {
              icon: 'checks',
              title: 'Publishing checks',
              body: 'Catch problems before your users do, with required or advisory checks.',
            },
            {
              icon: 'proposal',
              title: 'Agent-ready CLI',
              body: 'Content changes, reviewed like pull requests. Built for AI agents and CI.',
            },
            {
              icon: 'assets',
              title: 'Asset library',
              body: 'Assets that stay in sync with Figma and Google Drive, served at any size.',
            },
            {
              icon: 'data',
              title: 'Data sources',
              body: 'Pull in Google Sheets and APIs, then publish them alongside your content.',
            },
            {
              icon: 'lock',
              title: 'Roles & locks',
              body: 'The right hands on the right content, from viewer to admin.',
            },
            {
              icon: 'plug',
              title: 'Make it yours',
              body: 'Custom sidebar tools, themes, hooks and an embeddable editor.',
            },
            {
              icon: 'search',
              title: 'Global search',
              body: 'Find any doc, field or string with ⌘K.',
            },
          ],
        },

        // 9. Framework features (formerly the "web development tool" page).
        {
          _type: 'TemplateFeatureGrid',
          id: 'framework',
          options: ['theme:tint'],
          eyebrow: 'The framework',
          title: 'Fast by default. Flexible when you need it.',
          body: 'The same framework runs your marketing site, docs and blog, and it’s just TypeScript, TSX and Vite.',
          items: [
            {
              icon: 'server',
              title: 'Server-rendered TSX',
              body: 'Render on the server or build static HTML. Zero JavaScript unless you ask for it.',
            },
            {
              icon: 'components',
              title: 'Web component islands',
              body: 'Ship interactivity, not bundles. Only the elements on a page load their JS.',
            },
            {
              icon: 'route',
              title: 'File-based routing',
              body: 'Routes are files, with dynamic params, catch-alls and custom handlers.',
            },
            {
              icon: 'i18n',
              title: 'Built-in i18n',
              body: 'Localized URLs, locale fallbacks and sitemaps with hreflang, out of the box.',
            },
            {
              icon: 'plug',
              title: 'Plugins & pods',
              body: 'Extend the server, build and CMS, or package routes and schemas to share.',
            },
            {
              icon: 'rocket',
              title: 'Deploy anywhere',
              body: 'One command to Firebase or App Engine, with secrets synced from Secret Manager.',
            },
          ],
        },

        // 10. Closing call to action.
        {
          _type: 'TemplateHero',
          id: 'get-started',
          options: ['theme:dark', 'title:h2'],
          eyebrow: 'Get started',
          title: 'Start building on Root.js.',
          body: richtext(
            'Create a project in minutes, then invite your team into the CMS.'
          ),
          buttons: [
            button('Read the guide', '/guide/'),
            button(
              'Star on GitHub',
              'https://github.com/blinkk/rootjs',
              'outline'
            ),
          ],
          command: 'npm create @blinkk/root',
        },
      ],
    },
  };
}
