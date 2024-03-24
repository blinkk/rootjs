import {schema} from '@blinkk/root-cms';

const blockModules = import.meta.glob('/blocks/*/*.schema.ts', {
  eager: true,
});
const blocks = Object.values(blockModules).map(
  (module: {default: schema.Schema}) => module.default
);

function omit(schemas: schema.Schema[], ...args: string[]) {
  const fieldIds = args;
  return schemas.map((s) => {
    return {
      ...s,
      fields: s.fields.filter((field) => !fieldIds.includes(field.id)),
    };
  });
}

export default schema.define({
  name: 'Template50x50',
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
      options: [
        {value: 'layout:mobile-reverse'},
        {value: 'CopyBlock:mobile-text-center'},
      ],
      creatable: true,
    }),
    schema.oneOf({
      id: 'leftSection',
      label: 'Left Section',
      types: omit(blocks, 'id'),
    }),
    schema.oneOf({
      id: 'rightSection',
      label: 'Right Section',
      types: omit(blocks, 'id'),
    }),
  ],
});
