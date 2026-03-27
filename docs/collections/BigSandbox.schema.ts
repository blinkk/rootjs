import {schema} from '@blinkk/root-cms';

export default schema.collection({
  name: 'BigSandbox',
  description: 'Big Sandbox (huge documents)',
  url: '/big-sandbox/[slug]',
  group: 'Sandbox',
  preview: {
    title: 'meta.title',
    image: 'meta.image',
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/c2ECbvhJtxf3xbPIjaXCSpmvAsJkkhzJwG98T9RPvWy4s30jZKClom8pvWTnupRYOnyI3qGhNXPOwqoN6sqljkDO62LIKRtR988',
    },
  },

  fields: [
    schema.object({
      id: 'meta',
      label: 'Meta',
      fields: [
        schema.string({
          id: 'title',
          label: 'Title',
          translate: true,
        }),
        schema.string({
          id: 'description',
          label: 'Description',
          help: 'Description for SEO and social shares.',
          translate: true,
          variant: 'textarea',
        }),
        schema.image({
          id: 'image',
          label: 'Image',
          help: 'Meta image for social shares. Recommended size: 1200x600.',
        }),
        schema.references({
          id: 'relatedPosts',
          label: 'Related Posts',
          collections: ['BigSandbox'],
        }),
      ],
    }),
    schema.object({
      id: 'content',
      label: 'Content',
      fields: [
        schema.richtext({
          id: 'body',
          label: 'Main content body',
          help: 'Top content body.',
          translate: true,
          autosize: true,
          inlineComponents: [
            schema.define({
              name: 'Emoji',
              fields: [
                schema.select({
                  id: 'emojiName',
                  label: 'Emoji',
                  options: [
                    {value: 'heart', label: 'heart ❤️'},
                    {value: 'joy', label: 'joy 😂'},
                  ],
                }),
              ],
            }),
          ],
          blockComponents: [
            schema.define({
              name: 'RelatedPostsBlock',
              label: 'Related Posts',
              preview: {title: '{posts}'},
              fields: [
                schema.references({
                  id: 'posts',
                  label: 'Posts',
                  collections: ['BigSandbox'],
                }),
              ],
            }),
            schema.define({
              name: 'YouTubeBlock',
              label: 'YouTube Embed',
              preview: {title: '{youtubeUrl}'},
              fields: [
                schema.string({
                  id: 'youtubeUrl',
                  label: 'YouTube URL',
                  variant: 'textarea',
                  translate: true,
                }),
              ],
            }),
          ],
        }),
        schema.array({
          id: 'blocks',
          label: 'Content blocks',
          help: 'Add blocks to embed various content types to the blog.',
          of: schema.oneOf({
            types: schema.glob('/blocks/*/*.schema.ts'),
          }),
          preview: [
            'm{_index:02}: {_type} (#{id})',
            'm{_index:02}: {_type}',
            'm{_index:02}',
          ],
        }),
      ],
    }),
  ],
});
