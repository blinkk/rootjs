/**
 * A tiny fictional storefront ("Fernwood Market", a garden store and market)
 * rendered inside the CMS preview pane in screenshot scenes.
 */

import {GardenScene, SproutMark, VEGGIE_TINTS, Veggie} from './garden.js';
import type {VeggieKind} from './garden.js';

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

/** Default hero copy, shared with the editor fields in the scenes. */
export const SITE_COPY = {
  eyebrow: 'Spring harvest',
  title: 'Dig into the spring harvest',
  body: 'Heirloom carrots, candy-striped beets and peppery radishes, pulled this morning by growers just down the road.',
  primaryCta: 'Shop the market',
  secondaryCta: 'Visit the garden center',
};

/** Product listings shown below the hero. */
export const PRODUCTS: Array<{kind: VeggieKind; name: string; price: string}> =
  [
    {kind: 'carrot', name: 'Heirloom Carrots', price: '$4.50 / bunch'},
    {kind: 'beet', name: 'Chioggia Beets', price: '$5.00 / bunch'},
    {kind: 'radish', name: 'French Radishes', price: '$3.25 / bunch'},
    {kind: 'turnip', name: 'Purple Top Turnips', price: '$2.75 / lb'},
    {kind: 'parsnip', name: 'Sweet Parsnips', price: '$3.50 / lb'},
    {kind: 'sweetPotato', name: 'Garnet Sweet Potatoes', price: '$2.25 / lb'},
  ];

const INK = '#2b2a24';
const TERRACOTTA = '#c8553d';
const CREAM = '#fbf7ef';

export function SitePreview(props: SitePreviewProps) {
  const mobile = props.device === 'mobile';
  const title = props.title || SITE_COPY.title;
  const products = PRODUCTS.slice(0, mobile ? 2 : 3);
  return (
    <div
      className="cms-preview__frame"
      style={{
        width: `${props.width}px`,
        height: `${props.height}px`,
        fontFamily: 'Inter, sans-serif',
        color: INK,
        background: CREAM,
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
            letterSpacing: '-0.2px',
            marginRight: 'auto',
          }}
        >
          <SproutMark size={mobile ? 13 : 15} />
          fernwood market
        </strong>
        {!mobile && (
          <>
            <span>Produce</span>
            <span>Garden center</span>
            <span>Recipes</span>
          </>
        )}
        <span
          style={{
            padding: '5px 10px',
            borderRadius: '20px',
            background: '#3f6b3a',
            color: '#fff',
            marginLeft: mobile ? '0' : '6px',
          }}
        >
          Basket (3)
        </span>
      </div>
      <div
        style={{
          padding: mobile ? '18px 16px 16px' : '30px 28px 22px',
          textAlign: mobile ? 'left' : 'center',
        }}
      >
        <div
          style={{
            fontSize: mobile ? '9px' : '10px',
            fontWeight: 700,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: TERRACOTTA,
          }}
        >
          {SITE_COPY.eyebrow}
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
            color: '#5c574b',
            maxWidth: mobile ? 'none' : '420px',
            margin: '0 auto',
          }}
        >
          {SITE_COPY.body}
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
              background: TERRACOTTA,
              color: '#fff',
            }}
          >
            {SITE_COPY.primaryCta}
          </span>
          {!mobile && (
            <span
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                border: '1px solid #d8cfbd',
              }}
            >
              {SITE_COPY.secondaryCta}
            </span>
          )}
        </div>
      </div>
      <GardenScene
        style={{
          display: 'block',
          width: mobile ? 'calc(100% - 32px)' : 'calc(100% - 56px)',
          height: mobile ? '160px' : '220px',
          margin: mobile ? '0 16px' : '0 28px',
          borderRadius: '10px',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: mobile ? '16px 16px 0' : '22px 28px 0',
        }}
      >
        <strong style={{fontSize: mobile ? '12px' : '14px'}}>
          Fresh this week
        </strong>
        <span style={{fontSize: '10px', color: TERRACOTTA, fontWeight: 600}}>
          See all produce →
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr 1fr' : '1fr 1fr 1fr',
          gap: '10px',
          padding: mobile ? '10px 16px' : '12px 28px',
        }}
      >
        {products.map((product) => (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: mobile ? '70px' : '90px',
                borderRadius: '8px',
                background: VEGGIE_TINTS[product.kind],
              }}
            >
              <Veggie kind={product.kind} size={mobile ? 44 : 56} />
            </div>
            <div
              style={{fontSize: '10.5px', fontWeight: 600, marginTop: '6px'}}
            >
              {product.name}
            </div>
            <div style={{fontSize: '10px', color: '#7a7466', marginTop: '1px'}}>
              {product.price}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
