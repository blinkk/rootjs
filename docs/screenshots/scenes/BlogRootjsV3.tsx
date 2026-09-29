import type {SceneMeta} from '../types.js';
import {BlogMetaImage} from '../ui/blog.js';

export const meta: SceneMeta = {
  id: 'blog-rootjs-v3',
  width: 1200,
  height: 630,
  alt: 'Announcing Root.js v3.0 — A native JSX renderer, a smarter CMS, and a faster build pipeline.',
};

/** Meta image scene for `BlogPosts/rootjs-v3`. */
export default function BlogRootjsV3() {
  return (
    <BlogMetaImage
      date="May 20, 2026"
      title="Announcing Root.js v3.0"
      description="A native JSX renderer, a smarter CMS, and a faster build pipeline."
      badge="@blinkk/root v3.0"
      pills={[
        'Root AI + Tools',
        'Native JSX Renderer',
        'Vite 8 (Rolldown)',
        'Plugin Pods',
      ]}
    />
  );
}
