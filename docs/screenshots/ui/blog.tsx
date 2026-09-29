/**
 * Shared "Architectural Editorial Card" layout used for blog post meta (OG)
 * images in `screenshots/scenes/Blog*.tsx`.
 */

import type {ComponentChildren} from 'preact';

const BEET_SPRITE = [
  '...DD.....DD....',
  '..DLLD...DLLD...',
  '..DLLLD.DLLLD...',
  '...DLLLDLLLD....',
  '....DDLLLDD.....',
  '......DLD.......',
  '....KKKKKKK.....',
  '...KBBBBBBBK....',
  '..KBHHBBBBBBK...',
  '..KBHBBBBBBBK...',
  '..KBBBBBBBBBK...',
  '..KBBBBBBBBBK...',
  '...KBBBBBBBK....',
  '....KKBBBKK.....',
  '......KBK.......',
  '.......K........',
] as const;

const BEET_PALETTE: Record<string, string> = {
  K: '#2a0f22',
  B: '#6b2f55',
  H: '#b8578f',
  L: '#5bb03c',
  D: '#2d6b1f',
};

/** Props for {@link BeetIcon}. */
export interface BeetIconProps {
  /** Height of the rendered SVG in CSS pixels. */
  height?: number;
}

/** Renders the pixel-art Root.js beet emblem with crisp pixel edges. */
export function BeetIcon(props: BeetIconProps) {
  const height = props.height || 40;
  const width = Math.round((height * 11) / 16);
  const paths: Record<string, string> = {};
  BEET_SPRITE.forEach((row, y) => {
    row.split('').forEach((code, x) => {
      if (code in BEET_PALETTE) {
        paths[code] = (paths[code] || '') + `M${x} ${y}h1v1h-1z`;
      }
    });
  });
  return (
    <svg
      width={width}
      height={height}
      viewBox="2 0 11 16"
      shape-rendering="crispEdges"
      aria-hidden="true"
      style={{display: 'block', flex: '0 0 auto'}}
    >
      {Object.entries(paths).map(([code, d]) => (
        <path d={d} fill={BEET_PALETTE[code]} />
      ))}
    </svg>
  );
}

/** Props for {@link BlogMetaImage}. */
export interface BlogMetaImageProps {
  /** Formatted publish date shown in the top pill, e.g. "May 20, 2026". */
  date: string;
  /** Main blog post title. */
  title: string;
  /** Short summary or deck shown below the title. */
  description: string;
  /** Monospace label shown below the beet emblem in the right tile. */
  badge: string;
  /** Feature or topic pills displayed in a single row along the bottom. */
  pills: string[];
  /** Optional custom illustration to render inside the right tile. */
  artwork?: ComponentChildren;
}

/**
 * Renders a 1200x630 architectural editorial card for a Root.js blog post
 * social share image.
 */
export function BlogMetaImage(props: BlogMetaImageProps) {
  const titleFontSize = props.title.length > 36 ? '52px' : '60px';
  return (
    <div
      style={{
        position: 'relative',
        width: '1200px',
        height: '630px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: '#fbfbf9',
        backgroundImage:
          'linear-gradient(to right, rgba(228, 228, 225, 0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(228, 228, 225, 0.55) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        color: '#0f1115',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          width: '1072px',
          height: '506px',
          borderRadius: '24px',
          border: '1px solid #e4e4e1',
          background: '#ffffff',
          boxShadow:
            '0 1px 2px rgba(15, 17, 21, 0.05), 0 24px 60px -24px rgba(15, 17, 21, 0.18)',
          display: 'grid',
          gridTemplateColumns: '1fr 296px',
          padding: '48px 52px',
          gap: '44px',
          alignItems: 'center',
        }}
      >
        {/* Left editorial content. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <BeetIcon height={36} />
              <span
                style={{
                  fontFamily:
                    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontWeight: 800,
                  fontSize: '28px',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  color: '#0f1115',
                }}
              >
                Root.js
              </span>
            </div>
            <span
              style={{
                padding: '5px 12px',
                borderRadius: '999px',
                background: 'rgba(107, 47, 85, 0.1)',
                color: '#6b2f55',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Blog · {props.date}
            </span>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
            <h1
              style={{
                margin: 0,
                fontSize: titleFontSize,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                color: '#0f1115',
              }}
            >
              {props.title}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: '22px',
                lineHeight: 1.45,
                color: '#5f6368',
                maxWidth: '580px',
              }}
            >
              {props.description}
            </p>
          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
            {props.pills.map((pill) => (
              <span
                style={{
                  padding: '6px 13px',
                  borderRadius: '999px',
                  border: '1px solid #e4e4e1',
                  background: '#fbfbf9',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#3c4043',
                }}
              >
                {pill}
              </span>
            ))}
          </div>
        </div>

        {/* Right visual emblem tile. */}
        <div
          style={{
            height: '100%',
            borderRadius: '20px',
            border: '1px solid #e4e4e1',
            background: '#fbfbf9',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '22px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '220px',
              height: '220px',
              background:
                'radial-gradient(closest-side, rgba(107, 47, 85, 0.14), transparent)',
              pointerEvents: 'none',
            }}
          />
          {props.artwork || <BeetIcon height={160} />}
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '14px',
              fontWeight: 600,
              padding: '6px 16px',
              borderRadius: '999px',
              background: '#6b2f55',
              color: '#ffffff',
              letterSpacing: '0.02em',
            }}
          >
            {props.badge}
          </span>
        </div>
      </div>
    </div>
  );
}
