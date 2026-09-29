/**
 * @fileoverview Copy for the non-technical Root.js guides at `/guides/`,
 * written to the `Guides` collection by `seed_guides.ts`.
 *
 * The guides are written for decision makers (marketing and content leads,
 * product owners, and anyone choosing a content platform), so they explain
 * what each feature does for a team rather than how to set it up. Setup lives
 * in the developer docs at `/docs/`.
 *
 * Screenshots come from the TSX scenes in `screenshots/scenes/`, referenced by
 * scene id. See `docs/guides/README.md` for the workflow.
 */

import type {ScreenshotEntry, ScreenshotsMap} from '../screenshots/types.ts';

/** A rich text block, as stored by `schema.richtext()` fields. */
type RichTextBlock =
  | {type: 'paragraph'; data: {text: string}}
  | {type: 'unorderedList'; data: {style: 'unordered'; items: ListItem[]}};

interface ListItem {
  content: string;
}

/** Rich text value as stored by `schema.richtext()` fields. */
interface RichTextValue {
  blocks: RichTextBlock[];
  time: number;
  version: string;
}

/** A bulleted list, for use inside `richtext()`. */
function bullets(...items: string[]): RichTextBlock {
  return {
    type: 'unorderedList',
    data: {style: 'unordered', items: items.map((content) => ({content}))},
  };
}

/**
 * Builds a rich text value. Strings become paragraphs (inline HTML is
 * allowed), and `bullets()` adds a list.
 */
function richtext(...blocks: Array<string | RichTextBlock>): RichTextValue {
  return {
    blocks: blocks.map((block) =>
      typeof block === 'string'
        ? {type: 'paragraph', data: {text: block}}
        : block
    ),
    time: Date.now(),
    version: '2.28.2',
  };
}

/** A link to another guide. */
function guideLink(slug: string, label: string) {
  return `<a href="/guides/${slug}/">${label}</a>`;
}

/** Content for one guide, before screenshots are resolved. */
export interface GuideSource {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  /** Page title, when different from `title` (the meta title). */
  heading: string;
  intro: RichTextValue;
  /** Scene id of the hero screenshot. */
  heroImage: string;
  /**
   * Scene id of the meta image (social shares and the guides index card).
   * Defaults to `heroImage`.
   */
  cardImage?: string;
  takeaways: string[];
  sections: Array<{
    id: string;
    title: string;
    body: RichTextValue;
    /** Scene id of the section screenshot. */
    image?: string;
    caption?: string;
  }>;
  /** Frequently asked questions. */
  faq: Array<{question: string; answer: string}>;
}

export const GUIDES: GuideSource[] = [
  {
    slug: 'overview',
    title: 'Root.js at a glance',
    description:
      'What Root.js is, who it is for, and how it helps marketing, content and engineering teams ship websites together.',
    eyebrow: 'Overview',
    heading: 'One place for your team to build, edit and ship the website',
    intro: richtext(
      'Root.js is an open-source web platform with a built-in content management system (CMS). Developers build the site and define what content it needs. Everyone else — marketers, writers, designers, translators and reviewers — edits that content in a visual editor, previews it on the real site and publishes it when it is ready.',
      'This guide is a short tour for the people choosing a platform. Each section links to a more detailed guide.'
    ),
    heroImage: 'cms-editor-preview',
    // The editing guide also leads with the editor, so use a different card.
    cardImage: 'cms-content-list',
    takeaways: [
      'Edit with a live preview of the real site, on desktop and mobile.',
      'Schedule launches and bundle many changes into one release.',
      'Translate into every market from one workflow.',
      'Built-in AI that follows your roles and approvals.',
      'Open source, and your content stays in your own cloud project.',
    ],
    sections: [
      {
        id: 'who-its-for',
        title: 'Who it is for',
        body: richtext(
          'Root.js is built for organizations whose website is a product: brand and marketing sites, product launches, localized campaigns and content hubs that change every week and have many people involved.',
          bullets(
            '<b>Content and marketing teams</b> get a friendly editor, previews and scheduling, without waiting on a developer for every change.',
            '<b>Localization teams</b> get one place to see what needs translating, with AI and vendor integrations.',
            '<b>Engineering teams</b> keep the content model in code, reviewed and versioned like the rest of the site.',
            '<b>Leaders</b> get governance: roles, approvals, publishing checks and a full audit trail.'
          )
        ),
      },
      {
        id: 'how-content-is-organized',
        title: 'How content is organized',
        body: richtext(
          'Content lives in <b>collections</b>, such as Pages, Recipes or Products. Each collection has a clear structure that developers define for the site: a product page has a name, price and photos; a landing page is built from a set of approved sections. Editors fill in the blanks and rearrange sections, so every page stays on brand and nothing breaks the layout.',
          `Every doc shows at a glance whether it is a draft, published or scheduled, and who changed it last. See ${guideLink('editing', 'Editing and live preview')}.`
        ),
        image: 'cms-content-list',
        caption:
          'The Pages collection for a fictional garden store, with each page’s status and last editor.',
      },
      {
        id: 'from-draft-to-live',
        title: 'From draft to live',
        body: richtext(
          'Every change starts as a draft. Editors preview it on the real site, share a preview link, and publish when it is approved — right away, at a scheduled time, or together with other changes in a release. Automated checks can catch missing translations or other problems before anything goes live, and every version is kept so any mistake can be undone.',
          `See ${guideLink('publishing', 'Publishing, scheduling and releases')}.`
        ),
        image: 'cms-publish-checks',
        caption:
          'Scheduling a page to publish at launch time, with a change summary written by Root AI and automated checks.',
      },
      {
        id: 'ai-built-in',
        title: 'AI, built in',
        body: richtext(
          `Root AI is an assistant inside the CMS that understands your site’s content structure. It can answer questions about your content, draft copy, translate pages, write image descriptions and prepare releases. Editors choose whether it can only read, must ask before changing anything, or may edit drafts on its own. It never publishes by itself. See ${guideLink('root-ai', 'Root AI')}.`
        ),
      },
      {
        id: 'ownership',
        title: 'Open source, and your data stays yours',
        body: richtext(
          'Root.js, including the CMS, is open source under the MIT license, with no per-seat fees. Your content is stored in your organization’s own Google Cloud (Firebase) project, not in a vendor’s shared database, and people sign in with their Google accounts. You decide where the site is hosted and who has access.',
          `For roles, approvals and audit logs, see ${guideLink('governance', 'Roles, permissions and governance')}.`
        ),
      },
    ],
    faq: [
      {
        question: 'Can non-technical teams make changes without a developer?',
        answer:
          'Yes. Editors create pages from approved sections, edit text and images, and publish on their own, within the permissions their role allows.',
      },
      {
        question: 'Where does our content live?',
        answer:
          'In a Firestore database in your own Google Cloud project. You control access, backups and retention.',
      },
      {
        question: 'What does it cost?',
        answer:
          'The software is free and open source. You pay for your own hosting and cloud usage, and for any AI or translation providers you choose to connect.',
      },
      {
        question: 'How hard is it to change the content structure later?',
        answer:
          'The structure is defined in code, so developers change it the same way they change the site, with code review and version history.',
      },
    ],
  },

  {
    slug: 'editing',
    title: 'Editing and live preview',
    description:
      'How editors create and update pages in the CMS, preview them on the real site, and find any piece of content in seconds.',
    eyebrow: 'Editing',
    heading: 'Edit the page and see the result as you type',
    intro: richtext(
      'The hardest part of most content systems is imagining how a form turns into a web page. The Root.js CMS puts the two side by side: fields on the left, the real website on the right, updating as you type.'
    ),
    heroImage: 'cms-editor-preview',
    takeaways: [
      'Side-by-side editor and live preview.',
      'Desktop, tablet and mobile previews at once.',
      'Click anything in the preview to jump to its field.',
      'Pages are built from approved, on-brand sections.',
      'Find any doc or field with ⌘K search.',
    ],
    sections: [
      {
        id: 'live-preview',
        title: 'A live preview of the real site',
        body: richtext(
          'The preview is not an approximation. It is the actual website, rendered with the draft content, so what editors see is what visitors will get. Editors can view desktop, tablet and mobile sizes side by side, switch languages, and click any element in the preview to jump straight to the field that controls it.',
          'Preview links can be shared with anyone who has access to the CMS. Stakeholders who only need to review can be given the read-only Viewer role.'
        ),
      },
      {
        id: 'structured-content',
        title: 'Flexible pages, consistent brand',
        body: richtext(
          'Developers define the building blocks for each kind of page, such as a hero, a product grid or a set of cards. Editors add, remove and reorder those blocks to build new pages without writing code. Because each block has a fixed design, pages stay on brand and accessible, and editors cannot accidentally break a layout.',
          bullets(
            'Rich text with formatting, links and embedded components.',
            'Image fields with alt text, and a shared asset library.',
            'References between docs, such as a page that features a set of products.',
            'Help text on every field, so editors know what goes where.'
          )
        ),
        image: 'cms-content-list',
        caption:
          'Collections keep content organized. Each doc shows its status, last editor and a preview thumbnail.',
      },
      {
        id: 'search',
        title: 'Find anything with ⌘K',
        body: richtext(
          'Large sites have thousands of docs. Press ⌘K (Ctrl+K on Windows) anywhere in the CMS to search across every collection, including the text inside fields, and jump straight to the result. Inside a long doc, the in-editor search finds a field by its label or content.'
        ),
        image: 'cms-global-search',
        caption:
          'Global search finds every doc that mentions “carrot”, down to the field.',
      },
      {
        id: 'safety-nets',
        title: 'Safety nets while you work',
        body: richtext(
          `Drafts save automatically, and nothing reaches the live site until someone publishes it. Undo and redo work across fields, every save is kept in the version history, and any field can be rolled back to an earlier value. See ${guideLink('publishing', 'Publishing, scheduling and releases')}.`
        ),
      },
    ],
    faq: [
      {
        question: 'Can editors see exactly what visitors will see?',
        answer:
          'Yes. The preview renders the real site with draft content, at desktop, tablet and mobile sizes and in any language.',
      },
      {
        question: 'Can editors build new pages without a developer?',
        answer:
          'Yes, from the set of sections developers provide. New kinds of sections are added by developers when the design calls for them.',
      },
      {
        question: 'How do stakeholders review a draft?',
        answer:
          'Give them the read-only Viewer role and share a preview link to the draft page.',
      },
    ],
  },

  {
    slug: 'publishing',
    title: 'Publishing, scheduling and releases',
    description:
      'How Root.js takes content from draft to live: scheduled publishing, releases that launch many changes at once, automated checks and full version history.',
    eyebrow: 'Publishing',
    heading: 'Ship content like you ship code',
    intro: richtext(
      'Launches rarely involve a single page. A seasonal campaign might touch the home page, a dozen product pages, the navigation and a pricing sheet, in six languages, all at 9:00 AM on a Monday. Root.js is designed for that moment.'
    ),
    heroImage: 'cms-publish-checks',
    takeaways: [
      'Publish now, or schedule for an exact time.',
      'Releases launch many docs and data together.',
      'Automated checks run before anything goes live.',
      'AI-written summaries of what changed.',
      'Every version is kept and can be restored.',
    ],
    sections: [
      {
        id: 'drafts-and-publishing',
        title: 'Drafts, then publish',
        body: richtext(
          'Editing never changes the live site directly. Changes are saved to a draft, reviewed in preview, and published when ready. When publishing, editors can compare the draft to what is live, and add a short message describing the change — or let Root AI write one from the differences.',
          'Only people with an Editor or Admin role can publish, so contributors can prepare content that someone else approves.'
        ),
      },
      {
        id: 'scheduling',
        title: 'Scheduled publishing',
        body: richtext(
          'Pick a date and time, and the page publishes itself. There is no need for someone to be online at midnight to flip a switch, and the schedule is visible to the whole team in the doc’s status.'
        ),
      },
      {
        id: 'releases',
        title: 'Releases: launch everything at once',
        body: richtext(
          'A release groups many docs, and data such as a pricing spreadsheet, so they go live together. Teams build the release over days or weeks, preview it, and then publish it in one step or schedule it for launch time. Nothing in the release leaks out early, and nothing is left behind.'
        ),
        image: 'cms-releases',
        caption:
          'Releases for upcoming launches, each bundling docs and data sources with an owner and a publish time.',
      },
      {
        id: 'checks',
        title: 'Checks before anything goes live',
        body: richtext(
          'Publishing checks run automatically when someone publishes. A built-in check flags missing translations, and developers can add checks for anything your organization cares about: broken links, missing image descriptions, legal copy, SEO rules. Each check can block publishing or simply warn, so teams move fast without skipping the essentials.'
        ),
      },
      {
        id: 'history',
        title: 'Every version, recoverable',
        body: richtext(
          'The CMS keeps a version every time a doc is saved, and a tagged version every time it is published. Anyone can compare two versions side by side, restore an earlier version, or copy one into a new doc. Individual fields have their own history too, so one paragraph can be rolled back without undoing the rest of the page.'
        ),
        image: 'cms-version-history',
        caption:
          'Version history for a page: every save and publish, who made it, and options to compare, restore or copy.',
      },
    ],
    faq: [
      {
        question: 'Can we launch a campaign across many pages at one time?',
        answer:
          'Yes. Add every doc and data source to a release and schedule it. Everything publishes together.',
      },
      {
        question: 'Who can publish?',
        answer:
          'People with the Editor or Admin role. Contributors can edit drafts but not publish them, and publishing can be locked on a doc while it is under review.',
      },
      {
        question: 'What happens if something wrong goes live?',
        answer:
          'Restore the previous published version from the version history and publish it again. Every save and publish is kept.',
      },
      {
        question: 'Can we enforce our own quality rules?',
        answer:
          'Yes. Developers add publishing checks that block or warn, and they run for every publish.',
      },
    ],
  },

  {
    slug: 'localization',
    title: 'Localization and translation',
    description:
      'How Root.js helps teams launch and maintain a website in many languages, with AI translation, vendor integrations and clear visibility into what is missing.',
    eyebrow: 'Localization',
    heading: 'Every market, one workflow',
    intro: richtext(
      'Running a site in many languages usually means spreadsheets emailed back and forth, and pages that quietly go live with missing translations. Root.js keeps translations next to the content they belong to, shows exactly what is missing, and fills the gaps with AI or your translation vendor.'
    ),
    heroImage: 'cms-translations',
    takeaways: [
      'Choose which markets each page is live in.',
      'See every string that still needs translating.',
      'Translate with AI in one click, then review.',
      'Works with vendors such as Crowdin and DeepL.',
      'Export to and import from Google Sheets and CSV.',
    ],
    sections: [
      {
        id: 'markets',
        title: 'Choose where each page is live',
        body: richtext(
          'Each page chooses which languages and markets it is published in. A product page might launch in English, German and French first, and add Japanese later. Visitors are sent to their preferred language automatically, and search engines are told about every translated version.'
        ),
        image: 'cms-localization-modal',
        caption:
          'Choosing the locales a page is enabled for, with the translation status of each.',
      },
      {
        id: 'translations-editor',
        title: 'A translations editor for every page',
        body: richtext(
          'The translations editor lists every piece of text on a page, next to its translation in each language, and highlights what is missing. Translators work page by page, or across the whole site, without hunting through forms. When the source text changes, the new text shows up as missing, so outdated translations never slip through.',
          'Publishing checks can stop a page from going live while translations are missing.'
        ),
      },
      {
        id: 'ai-and-vendors',
        title: 'AI translation and your vendors',
        body: richtext(
          'For speed, Root AI can translate missing strings in one click, and a person reviews the result before it is published. For professional translation, the CMS connects to translation services such as Crowdin and DeepL, and teams can export strings to Google Sheets or CSV and import the results back.',
          'Many teams mix the two: AI for fast first drafts and low-risk copy, and a vendor or in-market reviewer for launches and legal text.'
        ),
      },
      {
        id: 'regional-variants',
        title: 'Regional variants without duplicate work',
        body: richtext(
          'Locales can fall back to one another, so a Swiss German page can reuse the German translation and only override what differs. Teams translate once and publish everywhere it applies.'
        ),
      },
    ],
    faq: [
      {
        question: 'How do we know what still needs translating?',
        answer:
          'Every page’s translations editor highlights missing strings, and a publishing check can block pages that are incomplete.',
      },
      {
        question: 'Can we keep our current translation vendor?',
        answer:
          'Most likely. Root.js integrates with services such as Crowdin and DeepL, and supports Google Sheets and CSV exchange for everyone else.',
      },
      {
        question: 'Is AI translation reviewed before it goes live?',
        answer:
          'Yes. AI translations are saved like any other edit, and are published only when someone publishes the page.',
      },
    ],
  },

  {
    slug: 'collaboration',
    title: 'Collaboration and review',
    description:
      'How teams give feedback, review changes and track content work in the CMS, with comments on fields, live presence and tasks.',
    eyebrow: 'Collaboration',
    heading: 'Feedback right where the words live',
    intro: richtext(
      'Website feedback usually lives everywhere except the website: in chat threads, email chains and screenshots with red circles. The Root.js CMS brings the conversation into the editor, next to the exact field it is about.'
    ),
    heroImage: 'cms-field-comments',
    takeaways: [
      'Comment on any field, with @mentions.',
      'See who else is viewing a doc right now.',
      'Get notified about comments and publishes.',
      'Track content work with tasks.',
    ],
    sections: [
      {
        id: 'comments',
        title: 'Comments on the field, not in the chat',
        body: richtext(
          'Anyone can start a comment thread on a specific field, such as a headline, an image or a call to action. Mention a teammate with @ and they are notified. Threads can be resolved when the change is made, and important ones can be pinned to the top of the doc, so decisions stay attached to the content they shaped.'
        ),
      },
      {
        id: 'presence',
        title: 'See who is working on what',
        body: richtext(
          'Avatars at the top of each doc show who else is viewing it right now, so two people do not rewrite the same page at the same time. The doc’s status shows when it was last saved, and by whom.'
        ),
      },
      {
        id: 'tasks',
        title: 'Track content work with tasks',
        body: richtext(
          'The task manager (currently an experimental feature) tracks the work behind a launch: writing copy, reviewing translations, replacing images. Tasks link to the docs they are about and have assignees, statuses and due dates, so the whole team can see what is left before a release.'
        ),
        image: 'cms-tasks',
        caption:
          'Tasks for a spring launch, each linked to a doc and assigned to a teammate.',
      },
      {
        id: 'notifications',
        title: 'Notifications',
        body: richtext(
          'The CMS can notify people by email when they are mentioned in a comment, or tell admins when content is published. Developers can connect other notification channels, such as your team chat.'
        ),
      },
    ],
    faq: [
      {
        question: 'Where does review feedback live?',
        answer:
          'On the field it is about, as a comment thread with @mentions, resolved when the change is made.',
      },
      {
        question: 'How do we avoid overwriting each other’s work?',
        answer:
          'Live presence shows who is viewing each doc, and every save is kept in the version history if something needs to be recovered.',
      },
      {
        question: 'Can we track a launch checklist in the CMS?',
        answer:
          'Yes, with tasks that link to docs and have assignees and due dates.',
      },
    ],
  },

  {
    slug: 'root-ai',
    title: 'Root AI',
    description:
      'How Root AI helps teams draft, translate and manage content inside the CMS, with guardrails that keep people in control.',
    eyebrow: 'Root AI',
    heading: 'An AI teammate that knows your content',
    intro: richtext(
      'Most AI writing tools work on a blank page. Root AI works inside the CMS, with the same understanding of your site’s structure, content and workflow that your team has. It can do real work, such as updating a page, translating it and adding it to a release, while your team stays in control of what is published.'
    ),
    heroImage: 'cms-root-ai',
    takeaways: [
      'Chat with an assistant that can read and edit your content.',
      'Choose read-only, ask-first or auto-edit modes.',
      'AI never publishes on its own.',
      'Help in the editor: rewrites, alt text, summaries.',
      'Use the AI model and provider of your choice.',
    ],
    sections: [
      {
        id: 'chat',
        title: 'Ask for it, review it, ship it',
        body: richtext(
          'Root AI is a chat assistant in the CMS. Ask it a question (“Which pages still mention the winter sale?”) or give it a job (“Translate the spring harvest page into German and French and add it to the spring release.”). It works through the same actions a person would, and shows each step it takes.'
        ),
      },
      {
        id: 'guardrails',
        title: 'Guardrails, not guesswork',
        body: richtext(
          'Every chat runs in one of three modes, chosen by the person using it:',
          bullets(
            '<b>Read only:</b> Root AI can look at content, but cannot change anything.',
            '<b>Ask before writing:</b> it plans changes and waits for approval before editing a draft. This is the default.',
            '<b>Auto-apply draft edits:</b> it edits drafts on its own.'
          ),
          'In every mode, Root AI works within the permissions of the person using it, only changes drafts, and never publishes. Publishing always goes through your normal workflow and checks.'
        ),
      },
      {
        id: 'in-the-editor',
        title: 'Help right in the editor',
        body: richtext(
          'AI also appears where editors already work: rewriting a headline, describing an image for accessibility, summarizing what changed before a publish, or translating missing strings. Each suggestion is reviewed before it is saved.'
        ),
        image: 'cms-ai-edit',
        caption:
          'Asking Root AI to rewrite a field, and reviewing the suggestion.',
      },
      {
        id: 'your-models',
        title: 'Your choice of AI provider',
        body: richtext(
          'Root AI is not tied to one vendor. Teams connect the models they have approved, from providers such as Anthropic, OpenAI and Google, or a self-hosted model, using their own accounts and keys. Editors pick a model in the chat, and admins decide which ones are offered.'
        ),
      },
      {
        id: 'agents',
        title: 'Ready for AI agents',
        body: richtext(
          'For teams using AI agents in their engineering workflow, Root.js includes a command-line tool and agent skills that let an agent propose content changes. Proposals are reviewed and tested like code changes before they are applied, so automation never bypasses review.'
        ),
      },
    ],
    faq: [
      {
        question: 'Can AI publish content by itself?',
        answer:
          'No. Root AI only edits drafts, within the permissions of the person using it. Publishing is always a human step.',
      },
      {
        question: 'Which AI models can we use?',
        answer:
          'Any model your developers configure, from Anthropic, OpenAI, Google, or a self-hosted model, using your organization’s own accounts.',
      },
      {
        question: 'Can we turn AI off?',
        answer:
          'Yes. AI features appear only when models are configured, and each chat can be limited to read-only.',
      },
    ],
  },

  {
    slug: 'governance',
    title: 'Roles, permissions and governance',
    description:
      'How Root.js controls who can view, edit and publish content, and keeps a record of every change.',
    eyebrow: 'Governance',
    heading: 'The right hands on the right content',
    intro: richtext(
      'As more people touch the website, the questions from legal, security and leadership get sharper: who can change the home page, who approved this, and what exactly changed last Tuesday? Root.js answers them with clear roles, publishing controls and a full activity log.'
    ),
    heroImage: 'cms-roles',
    takeaways: [
      'Four roles: Admin, Editor, Contributor and Viewer.',
      'Grant access to people or to a whole company domain.',
      'Groups that grant a role for selected collections only.',
      'Lock publishing on docs during a freeze.',
      'An activity log of saves, publishes and sharing changes.',
    ],
    sections: [
      {
        id: 'roles',
        title: 'Four simple roles',
        body: richtext(
          bullets(
            '<b>Viewer:</b> can see content and previews, but not change anything. Good for stakeholders and reviewers.',
            '<b>Contributor:</b> can create and edit drafts, but not publish. Good for writers, agencies and freelancers.',
            '<b>Editor:</b> can edit and publish content, and manage releases.',
            '<b>Admin:</b> can do everything, including managing people and project settings.'
          ),
          'Roles can be given to individuals, or to everyone at a company domain — for example, every <i>@yourcompany.com</i> account as a Viewer. These rules are enforced by the database itself, not only by the CMS interface.'
        ),
      },
      {
        id: 'permission-groups',
        title: 'Groups and per-collection access',
        body: richtext(
          'Admins can also organize people into groups, such as “Agency partners” or “Legal reviewers”, and give each group a role across the whole project or for selected collections only. Access stays easy to manage as teams and partners change.'
        ),
      },
      {
        id: 'locks',
        title: 'Publishing locks',
        body: richtext(
          'During a code freeze, a legal review or a big launch, publishing can be locked on a doc, with a reason and an optional end date. The lock is visible to everyone, and lifts automatically when the date passes.'
        ),
      },
      {
        id: 'audit-log',
        title: 'A record of every change',
        body: richtext(
          'The activity log records who did what, and when: saves, publishes, releases, translation imports, data syncs, publishing locks and sharing changes. Combined with version history, teams can always answer what changed, who changed it, and what it looked like before.'
        ),
        image: 'cms-action-logs',
        caption:
          'The activity log, with each action, the person who took it, and when.',
      },
      {
        id: 'security',
        title: 'Sign-in and data ownership',
        body: richtext(
          'People sign in with their Google accounts, so access follows your organization’s existing account policies. Content is stored in your own Google Cloud project, and nobody outside your organization has access unless you grant it.'
        ),
      },
    ],
    faq: [
      {
        question: 'Can freelancers or agencies work without publishing access?',
        answer:
          'Yes. Give them the Contributor role: they can edit drafts, and an Editor publishes.',
      },
      {
        question: 'Can we see who published a change and when?',
        answer:
          'Yes. The activity log and each doc’s version history show who saved and published, with timestamps and publish messages.',
      },
      {
        question: 'Can we restrict who edits legal or pricing content?',
        answer:
          'Yes. Use groups to give people a role for selected collections only, and lock publishing on docs when needed.',
      },
      {
        question: 'How do people sign in?',
        answer: 'With their Google accounts.',
      },
    ],
  },

  {
    slug: 'assets-and-data',
    title: 'Assets and data',
    description:
      'How Root.js manages images and files, keeps them in sync with design tools, and brings spreadsheet and API data into the website.',
    eyebrow: 'Assets and data',
    heading: 'Images, files and data, in sync',
    intro: richtext(
      'A website is more than words. It is photos and illustrations from the design team, and data like prices, store hours and inventory that change often. Root.js keeps both organized and up to date, without copy and paste.'
    ),
    heroImage: 'cms-asset-library',
    takeaways: [
      'A shared asset library with folders and bulk upload.',
      'Sync images from Figma and Google Drive.',
      'Images resized and optimized automatically.',
      'Pull data from Google Sheets and APIs on a schedule.',
      'Publish data with the content that uses it.',
    ],
    sections: [
      {
        id: 'asset-library',
        title: 'One library for every asset',
        body: richtext(
          'The asset library is a shared home for images and files, organized in folders. Upload in bulk, search by name, and reuse the same image across many pages, with a record of who changed each file and when.'
        ),
      },
      {
        id: 'design-sync',
        title: 'Stay in sync with design',
        body: richtext(
          'Any folder in the library can be connected to a Figma file or a Google Drive folder. When the design team updates an illustration, one click on Sync pulls in new and changed files — no exporting and re-uploading by hand. Pages that use a changed image are updated in draft, ready to review and publish.',
          'Sync runs with each person’s own Figma or Google access, so only people who can see the source files can import them.'
        ),
      },
      {
        id: 'image-service',
        title: 'Fast images, automatically',
        body: richtext(
          'Uploaded images are served through an image service that resizes and converts them for each screen. Editors upload one high-resolution original, and visitors on phones download a small, fast version.'
        ),
      },
      {
        id: 'data-sources',
        title: 'Bring your data along',
        body: richtext(
          'Data sources connect the website to information that lives elsewhere: a Google Sheet of prices maintained by the merchandising team, or a feed of store hours from an internal system. The CMS syncs the data on demand or on a schedule (hourly, daily, weekly and so on), shows when it was last updated, and publishes it on its own, automatically after each sync, or as part of a release, so new prices go live at the same moment as the campaign that announces them.'
        ),
        image: 'cms-data-sources',
        caption:
          'Data sources from Google Sheets and an API, with their sync and publish status.',
      },
    ],
    faq: [
      {
        question: 'Can our designers keep working in Figma?',
        answer:
          'Yes. Assets can be synced from Figma and Google Drive into the asset library.',
      },
      {
        question: 'Can non-developers update data such as prices?',
        answer:
          'Yes. Keep the data in a Google Sheet, and the CMS syncs and publishes it, including as part of a scheduled release.',
      },
      {
        question: 'Do editors need to resize images?',
        answer:
          'No. Upload the original; the image service creates the right size for each screen.',
      },
    ],
  },

  {
    slug: 'extensibility',
    title: 'Integrations and extensibility',
    description:
      'How Root.js fits into your existing tools and workflows, and how developers extend it for your team.',
    eyebrow: 'Integrations',
    heading: 'Make the CMS your own',
    intro: richtext(
      'Every organization has its own tools, rules and habits. The Root.js CMS is designed to be extended, so it can fit how your team already works instead of the other way around.'
    ),
    heroImage: 'cms-sidebar-tools',
    takeaways: [
      'Add your own tools to the CMS sidebar.',
      'Custom publishing checks and notifications.',
      'Connect AI, translation and data providers.',
      'Content structure defined in code, with version control.',
      'Open source, with no vendor lock-in.',
    ],
    sections: [
      {
        id: 'custom-tools',
        title: 'Your tools, inside the CMS',
        body: richtext(
          'Developers can add custom tools to the CMS sidebar, such as a launch checklist, an SEO dashboard or an internal reporting page, so editors do not have to leave the CMS to use them.'
        ),
      },
      {
        id: 'workflow-hooks',
        title: 'Plug into your workflow',
        body: richtext(
          bullets(
            '<b>Publishing checks</b> enforce your own rules before content goes live.',
            '<b>Notifications</b> send updates to email or your team chat.',
            '<b>Action hooks</b> trigger other systems, such as analytics or a search index, when content changes.',
            '<b>Themes</b> adjust the look of the CMS to suit your team.'
          )
        ),
      },
      {
        id: 'providers',
        title: 'Bring your own providers',
        body: richtext(
          'Root.js connects to the services your organization already uses and approves: AI models from several providers, translation services such as Crowdin and DeepL, and data from Google Sheets or any API.'
        ),
      },
      {
        id: 'content-as-code',
        title: 'Content structure as code',
        body: richtext(
          'The structure of your content is defined in code alongside the website. Changes to it are reviewed, tested and versioned like any other change, and developers get type checking that catches mistakes before they reach editors. The editor can also be embedded in other internal apps.'
        ),
      },
      {
        id: 'no-lock-in',
        title: 'No lock-in',
        body: richtext(
          'Root.js, including the CMS, is open source under the MIT license. Content is stored in your own cloud project and can be exported at any time, and the code that renders your website is yours.'
        ),
      },
    ],
    faq: [
      {
        question: 'Can we add our own internal tools to the CMS?',
        answer:
          'Yes. Developers can add custom pages to the CMS sidebar, and custom publishing checks, notifications and hooks.',
      },
      {
        question: 'What if we want to move off Root.js later?',
        answer:
          'Your content is in your own database and can be exported, and the software is open source.',
      },
      {
        question: 'Does it work with our existing providers?',
        answer:
          'Root.js supports several AI, translation and data providers out of the box, and developers can add others.',
      },
    ],
  },
];

/** Scene id → image field value, or undefined when it hasn't been uploaded. */
function image(screenshots: ScreenshotsMap, id: string | undefined) {
  if (!id) {
    return undefined;
  }
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

/** Returns every scene id referenced by the guides. */
export function listGuideScenes(guides: GuideSource[] = GUIDES) {
  const ids = new Set<string>();
  for (const guide of guides) {
    ids.add(guide.heroImage);
    if (guide.cardImage) {
      ids.add(guide.cardImage);
    }
    for (const section of guide.sections) {
      if (section.image) {
        ids.add(section.image);
      }
    }
  }
  return Array.from(ids).sort();
}

/** Returns the `fields` for a `Guides/<slug>` doc. */
export function buildGuideFields(
  guide: GuideSource,
  screenshots: ScreenshotsMap
) {
  return {
    meta: {
      title: guide.title,
      description: guide.description,
      image: image(screenshots, guide.cardImage || guide.heroImage),
    },
    content: {
      eyebrow: guide.eyebrow,
      title: guide.heading,
      intro: guide.intro,
      heroImage: image(screenshots, guide.heroImage),
      takeaways: guide.takeaways.map((text) => ({text})),
      sections: guide.sections.map((section) => ({
        id: section.id,
        title: section.title,
        body: section.body,
        image: image(screenshots, section.image),
        caption: section.image ? section.caption : undefined,
      })),
      faq: guide.faq,
    },
  };
}
