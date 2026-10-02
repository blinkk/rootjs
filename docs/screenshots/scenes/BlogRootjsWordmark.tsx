import type {SceneMeta} from '../types.js';
import {BeetIcon} from '../ui/blog.js';

export const meta: SceneMeta = {
  id: 'blog-rootjs-wordmark',
  width: 1200,
  height: 630,
  alt: 'The Root.js logo: an 8-bit pixel-art beetroot next to the words "Root.js".',
};

/** The Root.js wordmark, centered, for the "Meet the beet" blog section. */
export default function BlogRootjsWordmark() {
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fbfbf9',
        color: '#0f1115',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          lineHeight: 1,
          gap: '44px',
        }}
      >
        <BeetIcon height={128} />
        <span
          style={{
            fontSize: '92px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
          }}
        >
          Root.js
        </span>
      </div>
    </div>
  );
}
