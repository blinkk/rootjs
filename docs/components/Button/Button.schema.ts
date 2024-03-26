import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'Button',
  description: '',
  fields: [
    schema.multiselect({
      id: 'options',
      label: 'Button Options',
      options: [
        {value: 'variant:primary'},
        {value: 'variant:secondary'},
        {value: 'variant:outline'},
      ],
      creatable: true,
    }),
    schema.string({
      id: 'label',
      label: 'Button: Label',
      translate: true,
    }),
    schema.string({
      id: 'ariaLabel',
      label: 'Button: ARIA Label',
      help: 'Optional accessibility label.',
      translate: true,
    }),
    schema.string({
      id: 'href',
      label: 'Button: URL',
    }),
  ],
});
