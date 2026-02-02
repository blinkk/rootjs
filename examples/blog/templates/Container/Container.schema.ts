import {schema} from '@blinkk/root-cms';

/**
 * Container template that can hold other templates, including other Containers.
 *
 * Uses `schema.allSchemas()` to reference templates by glob pattern. This
 * pattern is resolved at project load time when all schemas are available,
 * completely avoiding circular import issues that would occur with
 * `import.meta.glob()`.
 */
export default schema.define({
  name: 'Container',
  description: 'A container that can hold other templates.',
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.',
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      help: 'Optional title for the container.',
      translate: true,
    }),
    schema.select({
      id: 'layout',
      label: 'Layout',
      help: 'How children are arranged.',
      options: [
        {value: 'stack', label: 'Stack (vertical)'},
        {value: 'row', label: 'Row (horizontal)'},
        {value: 'grid', label: 'Grid'},
      ],
      default: 'stack',
    }),
    schema.array({
      id: 'children',
      label: 'Children',
      help: 'Nested templates inside this container.',
      preview: '{_type}',
      of: schema.oneOf({
        // All templates matching this pattern, including Container itself.
        types: schema.allSchemas('/templates/*/*.schema.ts'),
      }),
    }),
  ],
});
