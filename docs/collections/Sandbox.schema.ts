import {schema} from '@blinkk/root-cms';
import PagesSchema from './Pages.schema.js';

export default schema.collection({
  name: 'Sandbox',
  description: 'Sandbox Pages (Preview Only)',
  url: '/sandbox/[...slug]',
  group: 'Sandbox',
  preview: {
    title: 'meta.title',
    image: ['content.modules[0].file', 'meta.image'],
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/sdCQ6SQzxbiw0CSR4pG3TGaXZNbsFdEKrj8GfZRQlB98zUW68D0qJyUZzwDCh3il5LBIH-pGoK0aMSySR4v-SpyX11sPLehvSw',
    },
  },
  autolock: false,
  fields: PagesSchema.fields,
  customSorting: true,
});
