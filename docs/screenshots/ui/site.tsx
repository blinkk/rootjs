/**
 * A tiny fictional marketing site ("Lumen Outdoor") rendered inside the CMS
 * preview pane in screenshot scenes.
 */

import {Artwork} from './cms.js';

export interface SitePreviewProps {
  /** Width of the frame in CSS pixels. */
  width: number;
  /** Height of the frame in CSS pixels. */
  height: number;
  /** Layout mode, which changes type sizes and stacking. */
  device: 'desktop' | 'mobile';
  /** Hero title, so scenes can show an in-progress edit. */
  title?: string;
  /** Whether to outline the title, as the CMS does for the focused field. */
  highlightTitle?: boolean;
}

export function SitePreview(props: SitePreviewProps) {
  const mobile = props.device === 'mobile';
  const title = props.title || 'Chase the first light of spring';
  return (
    <div
      className="cms-preview__frame"
      style={{
        width: `${props.width}px`,
        height: `${props.height}px`,
        fontFamily: 'Inter, sans-serif',
        color: '#14213d',
        borderRadius: mobile ? '18px' : '6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: mobile ? '0' : '18px',
          padding: mobile ? '12px 14px' : '14px 28px',
          fontSize: mobile ? '10px' : '11px',
          fontWeight: 500,
        }}
      >
        <strong
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: mobile ? '12px' : '14px',
            marginRight: 'auto',
          }}
        >
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'linear-gradient(90deg, #14213d 50%, #e76f51 50%)',
            }}
          />
          lumen
        </strong>
        {!mobile && (
          <>
            <span>Gear</span>
            <span>Journal</span>
            <span>Stores</span>
          </>
        )}
        <span
          style={{
            padding: '5px 10px',
            borderRadius: '20px',
            background: '#14213d',
            color: '#fff',
            marginLeft: mobile ? '0' : '6px',
          }}
        >
          Shop
        </span>
      </div>
      <div
        style={{
          padding: mobile ? '18px 16px 16px' : '34px 28px 24px',
          textAlign: mobile ? 'left' : 'center',
        }}
      >
        <div
          style={{
            fontSize: mobile ? '9px' : '10px',
            fontWeight: 700,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: '#e76f51',
          }}
        >
          Spring collection
        </div>
        <div
          className={props.highlightTitle ? 'cms-highlight' : undefined}
          style={{
            fontSize: mobile ? '22px' : '34px',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.8px',
            margin: mobile ? '8px 0' : '10px auto',
            maxWidth: mobile ? 'none' : '440px',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: mobile ? '11px' : '12.5px',
            lineHeight: 1.5,
            color: '#4a5568',
            maxWidth: mobile ? 'none' : '400px',
            margin: '0 auto',
          }}
        >
          Lightweight layers and trail-tested gear for early mornings, long
          switchbacks and everything in between.
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: mobile ? 'flex-start' : 'center',
            marginTop: mobile ? '12px' : '16px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          <span
            style={{
              padding: '7px 14px',
              borderRadius: '20px',
              background: '#e76f51',
              color: '#fff',
            }}
          >
            Shop the collection
          </span>
          {!mobile && (
            <span
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                border: '1px solid #cbd5e0',
              }}
            >
              Read the journal
            </span>
          )}
        </div>
      </div>
      <Artwork
        variant="dawn"
        style={{
          margin: mobile ? '0 16px' : '0 28px',
          height: mobile ? '160px' : '220px',
          borderRadius: '10px',
        }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr 1fr' : '1fr 1fr 1fr',
          gap: '10px',
          padding: mobile ? '14px 16px' : '18px 28px',
        }}
      >
        {(['forest', 'dusk', 'dawn'] as const)
          .slice(0, mobile ? 2 : 3)
          .map((variant, i) => (
            <div>
              <Artwork
                variant={variant}
                style={{height: mobile ? '70px' : '90px', borderRadius: '8px'}}
              />
              <div
                style={{fontSize: '10.5px', fontWeight: 600, marginTop: '6px'}}
              >
                {['Ridge Shell Jacket', 'Nightfall Tent', 'Trailhead Pack'][i]}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
