import {schema} from '@blinkk/root-cms';
import PagesSchema from './Pages.schema.js';

export default schema.collection({
  name: 'Sandbox',
  description: 'Sandbox Pages (Preview Only)',
  url: '/sandbox/[...slug]',
  preview: {
    title: 'meta.title',
    image: 'meta.image',
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/c2ECbvhJtxf3xbPIjaXCSpmvAsJkkhzJwG98T9RPvWy4s30jZKClom8pvWTnupRYOnyI3qGhNXPOwqoN6sqljkDO62LIKRtR988',
    },
  },
  autolock: false,
  fields: PagesSchema.fields,
});
