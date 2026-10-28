import {IconChevronRight} from '@tabler/icons-preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {Breadcrumbs} from './Breadcrumbs.js';

export const BreadcrumbsGallery = defineGallery({
  id: 'breadcrumbs',
  name: 'Breadcrumbs',
  group: 'Primitives',
  stories: {
    'Two levels': () => (
      <Breadcrumbs
        items={[
          {label: 'Releases', href: '#releases'},
          {label: 'spring-launch'},
        ]}
      />
    ),
    'Three levels (collapses on mobile)': () => (
      <Breadcrumbs
        items={[
          {label: 'Data Sources', href: '#data'},
          {label: 'homepage-feed', href: '#data/homepage-feed'},
          {label: 'Edit'},
        ]}
      />
    ),
    'Long labels truncate': () => (
      <Breadcrumbs
        items={[
          {label: 'Content', href: '#content'},
          {label: 'BlogPosts', href: '#content/BlogPosts'},
          {
            label:
              'announcing-the-spring-launch-of-our-brand-new-homepage-and-pricing',
          },
        ]}
      />
    ),
    'Custom separator': () => (
      <Breadcrumbs
        separator={<IconChevronRight size={12} className="block" />}
        items={[{label: 'Tasks', href: '#tasks'}, {label: '#128'}]}
      />
    ),
  },
});
