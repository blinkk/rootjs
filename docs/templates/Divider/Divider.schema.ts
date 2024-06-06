import {schema} from '@blinkk/root-cms';
import Spacer from '@/templates/Spacer/Spacer.schema.js';

export default schema.define({
  name: 'Divider',
  description: '',
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.',
    }),
    schema.multiselect({
      id: 'options',
      label: 'Module Options',
      help: 'Layout and display options.',
      options: [],
      creatable: true,
    }),
    schema.object({
      id: 'spacer',
      label: 'Spacer',
      help: 'Optional. Vertical spacing above and below the divider.',
      fields: Spacer.fields,
      variant: 'drawer',
      drawerOptions: {collapsed: true, inline: true},
    }),
  ],
});
