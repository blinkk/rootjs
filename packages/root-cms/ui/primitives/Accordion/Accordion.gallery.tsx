import {IconFolder} from '@tabler/icons-preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {Badge} from '../Badge/Badge.js';
import {Accordion, AccordionItem} from './Accordion.js';

export const AccordionGallery = defineGallery({
  id: 'accordion',
  name: 'Accordion',
  group: 'Primitives',
  stories: {
    'Single (one open at a time)': () => (
      <Accordion defaultValue={['what']} className="max-w-lg">
        <AccordionItem value="what" label="What is a release?">
          A release publishes a set of documents together, now or on a schedule.
        </AccordionItem>
        <AccordionItem value="who" label="Who can publish?">
          Admins and editors.
        </AccordionItem>
        <AccordionItem value="undo" label="Can I undo a publish?" disabled>
          Not yet.
        </AccordionItem>
      </Accordion>
    ),
    'Multiple, with rich labels': () => (
      <Accordion
        multiple
        defaultValue={['editors', 'viewers']}
        className="max-w-lg"
      >
        <AccordionItem
          value="editors"
          label={
            <span className="flex items-center gap-2">
              Editors
              <Badge size="xs" className="rounded-sm">
                3 members
              </Badge>
            </span>
          }
        >
          ada@example.com, grace@example.com, margaret@example.com
        </AccordionItem>
        <AccordionItem
          value="viewers"
          label={
            <span className="flex items-center gap-2">
              Viewers
              <Badge size="xs" className="rounded-sm">
                1 member
              </Badge>
            </span>
          }
        >
          alan@example.com
        </AccordionItem>
        <AccordionItem value="contributors" label="Contributors">
          Nobody yet.
        </AccordionItem>
      </Accordion>
    ),
    'Chevron on the left': () => (
      <Accordion
        chevronPosition="left"
        defaultValue={['pages']}
        className="max-w-xs"
      >
        <AccordionItem
          value="pages"
          label={
            <span className="flex items-center gap-2">
              <IconFolder size={16} aria-hidden="true" /> pages
            </span>
          }
        >
          <span className="text-muted">index, about, pricing</span>
        </AccordionItem>
        <AccordionItem
          value="blog"
          label={
            <span className="flex items-center gap-2">
              <IconFolder size={16} aria-hidden="true" /> blog
            </span>
          }
        >
          <span className="text-muted">hello-world</span>
        </AccordionItem>
      </Accordion>
    ),
  },
});
