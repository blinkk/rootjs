import PagesSchema from './Pages.schema.js';

export default {
  ...PagesSchema,
  name: 'Pages [SANDBOX]',
  description: 'Sandbox Pages',
  url: '/sandbox/[...slug]',
};
