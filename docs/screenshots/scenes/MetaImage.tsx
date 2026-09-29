import {
  IconChevronDown,
  IconChevronRight,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconGripVertical,
  IconRefresh,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {
  CmsFrame,
  DocStatusBar,
  EditorHeader,
  Field,
  Input,
  PROJECT_NAME,
  RichTextInput,
} from '../ui/cms.js';
import {
  GardenScene,
  SproutMark,
  VEGGIE_TINTS,
  Veggie,
  VeggieShape,
} from '../ui/garden.js';
import type {VeggieKind} from '../ui/garden.js';
import {PRODUCTS, SITE_COPY} from '../ui/site.js';

export const meta: SceneMeta = {
  id: 'meta-image',
  width: 1200,
  height: 630,
  alt: 'Root.js — Build. Edit. Ship.',
};

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

/** Renders the pixel-art beet icon at 3x scale (33x48px). */
function BeetIcon() {
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
      width={33}
      height={48}
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

/** Wide garden hero illustration proportioned for the single-device desktop preview. */
function WideGardenScene(props: {style?: preact.JSX.CSSProperties}) {
  const rows: Array<{
    y: number;
    kind: VeggieKind;
    scale: number;
    count: number;
  }> = [
    {y: 118, kind: 'carrot', scale: 0.32, count: 12},
    {y: 145, kind: 'beet', scale: 0.38, count: 10},
    {y: 175, kind: 'radish', scale: 0.43, count: 9},
  ];
  return (
    <svg
      style={props.style}
      viewBox="0 0 784 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="garden-sky-wide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fbe3c0" />
          <stop offset="1" stop-color="#fdf4e3" />
        </linearGradient>
      </defs>
      <rect width="784" height="220" fill="url(#garden-sky-wide)" />
      <circle cx="624" cy="48" r="32" fill="#ffd27d" />
      <path
        d="M0 100 Q160 62 320 88 T640 80 T784 84 V220 H0 Z"
        fill="#b9d3a4"
      />
      <path d="M0 114 Q200 90 400 106 T784 98 V220 H0 Z" fill="#8fb97a" />
      <rect y="116" width="784" height="104" fill="#7a5237" />
      {rows.map((row, r) => (
        <g>
          <rect
            y={row.y + 10}
            width="784"
            height="15"
            fill={r % 2 ? '#6a4630' : '#86593b'}
          />
          {Array.from({length: row.count}).map((_, i) => {
            const x = 28 + i * (728 / row.count) + (r % 2) * 22;
            return (
              <g
                transform={`translate(${x} ${row.y - 14}) scale(${row.scale})`}
              >
                <VeggieShape kind={row.kind} />
              </g>
            );
          })}
        </g>
      ))}
      <g transform="translate(516 148)">
        <rect width="184" height="70" rx="4" fill="#c58c57" />
        <g transform="translate(18 -42) scale(0.46) rotate(-18 50 60)">
          <VeggieShape kind="carrot" />
        </g>
        <g transform="translate(50 -36) scale(0.42)">
          <VeggieShape kind="beet" />
        </g>
        <g transform="translate(88 -34) scale(0.39)">
          <VeggieShape kind="turnip" />
        </g>
        <g transform="translate(122 -40) scale(0.46) rotate(16 50 60)">
          <VeggieShape kind="parsnip" />
        </g>
        <rect y="10" width="184" height="60" rx="4" fill="#c58c57" />
        <rect y="28" width="184" height="4" fill="#a8703f" />
        <rect y="48" width="184" height="4" fill="#a8703f" />
        <text
          x="92"
          y="24"
          text-anchor="middle"
          font-family="Inter, sans-serif"
          font-size="10.5"
          font-weight="700"
          fill="#6b4222"
          letter-spacing="1.5"
        >
          FERNWOOD
        </text>
      </g>
    </svg>
  );
}

/** Single-device desktop preview frame inside the CMS preview pane. */
function DesktopSitePreview() {
  const products = PRODUCTS.slice(0, 3);
  const INK = '#2b2a24';
  const TERRACOTTA = '#c8553d';
  const CREAM = '#fbf7ef';
  return (
    <div
      className="cms-preview__frame"
      style={{
        width: '840px',
        height: '760px',
        fontFamily: 'Inter, sans-serif',
        color: INK,
        background: CREAM,
        borderRadius: '6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          padding: '14px 28px',
          fontSize: '11px',
          fontWeight: 500,
        }}
      >
        <strong
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '14px',
            letterSpacing: '-0.2px',
            marginRight: 'auto',
          }}
        >
          <SproutMark size={15} />
          fernwood market
        </strong>
        <span>Produce</span>
        <span>Garden center</span>
        <span>Recipes</span>
        <span
          style={{
            padding: '5px 10px',
            borderRadius: '20px',
            background: '#3f6b3a',
            color: '#fff',
            marginLeft: '6px',
          }}
        >
          Basket (3)
        </span>
      </div>
      <div
        style={{
          padding: '30px 28px 22px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: TERRACOTTA,
          }}
        >
          {SITE_COPY.eyebrow}
        </div>
        <div
          className="cms-highlight"
          style={{
            fontSize: '34px',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.8px',
            margin: '10px auto',
            maxWidth: '440px',
          }}
        >
          {SITE_COPY.title}
        </div>
        <div
          style={{
            fontSize: '12.5px',
            lineHeight: 1.5,
            color: '#5c574b',
            maxWidth: '420px',
            margin: '0 auto',
          }}
        >
          {SITE_COPY.body}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginTop: '16px',
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
          <span
            style={{
              padding: '7px 14px',
              borderRadius: '20px',
              border: '1px solid #d8cfbd',
            }}
          >
            {SITE_COPY.secondaryCta}
          </span>
        </div>
      </div>
      <WideGardenScene
        style={{
          display: 'block',
          width: 'calc(100% - 56px)',
          height: '220px',
          margin: '0 28px',
          borderRadius: '10px',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '22px 28px 0',
        }}
      >
        <strong style={{fontSize: '14px'}}>Fresh this week</strong>
        <span style={{fontSize: '10px', color: TERRACOTTA, fontWeight: 600}}>
          See all produce →
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '10px',
          padding: '12px 28px',
        }}
      >
        {products.map((product) => (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '90px',
                borderRadius: '8px',
                background: VEGGIE_TINTS[product.kind],
              }}
            >
              <Veggie kind={product.kind} size={56} />
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

/** The CMS doc editor with only the desktop preview selected. */
function DesktopEditorPreview() {
  return (
    <CmsFrame
      active="content"
      topRight={
        <DocStatusBar
          viewers={['Ada', 'Kenji', 'Priya']}
          saveState="Saved just now"
          badges={[
            ['draft', 'Draft'],
            ['scheduled', 'Scheduled'],
          ]}
          activeTool="comments"
          comments={3}
        />
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '500px 1fr',
          height: '100%',
        }}
      >
        <div className="cms-editor">
          <EditorHeader docId="Pages/spring-harvest" />
          <div className="cms-editor__fields">
            <div
              className="cms-drawer"
              style={{borderTop: 'none', paddingTop: 0}}
            >
              <div className="cms-drawer__header">
                <IconChevronRight />
                Meta
                <span className="cms-muted" style={{fontWeight: 400}}>
                  — Spring harvest · {PROJECT_NAME}
                </span>
              </div>
            </div>
            <div className="cms-drawer">
              <div className="cms-drawer__header">
                <IconChevronDown />
                Content
              </div>
              <div className="cms-drawer__body">
                <div className="cms-array-item">
                  <IconGripVertical />
                  <strong>m00:</strong> Hero
                  <span className="cms-muted" style={{marginLeft: 'auto'}}>
                    TemplateHero
                  </span>
                </div>
                <Field label="Eyebrow">
                  <Input>{SITE_COPY.eyebrow}</Input>
                </Field>
                <Field label="Title" comments={2}>
                  <Input focused textarea>
                    {SITE_COPY.title}
                  </Input>
                </Field>
                <Field label="Body">
                  <RichTextInput>{SITE_COPY.body}</RichTextInput>
                </Field>
                <Field label="Image" help="Recommended: 2400x1200 JPG.">
                  <div className="cms-image-field">
                    <GardenScene className="cms-image-field__thumb" />
                    <div>
                      <div style={{fontWeight: 600}}>
                        spring-harvest-hero.jpg
                      </div>
                      <div className="cms-muted" style={{fontSize: '11px'}}>
                        2400×1200 · Alt: Rows of carrots and beets in a garden
                        bed
                      </div>
                    </div>
                  </div>
                </Field>
                <div className="cms-array-item">
                  <IconGripVertical />
                  <strong>m01:</strong> Fresh this week
                  <span className="cms-muted" style={{marginLeft: 'auto'}}>
                    TemplateProductGrid
                  </span>
                </div>
                <div className="cms-array-item">
                  <IconGripVertical />
                  <strong>m02:</strong> Root vegetable recipes
                  <span className="cms-muted" style={{marginLeft: 'auto'}}>
                    TemplateCards
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="cms-preview">
          <div className="cms-preview__bar">
            <span className="cms-icon-button cms-button--active">
              <IconDeviceDesktop />
            </span>
            <span className="cms-icon-button">
              <IconDeviceTablet />
            </span>
            <span className="cms-icon-button">
              <IconDeviceMobile />
            </span>
            <span className="cms-preview__url">
              fernwood.example/spring-harvest/?preview=true
            </span>
            <span className="cms-chip">EN</span>
            <span className="cms-icon-button">
              <IconRefresh />
            </span>
          </div>
          <div className="cms-preview__frames">
            <DesktopSitePreview />
          </div>
        </div>
      </div>
    </CmsFrame>
  );
}

/** Default Open Graph / social meta image for rootjs.dev. */
export default function MetaImage() {
  return (
    <div
      style={{
        position: 'relative',
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        backgroundColor: '#fbfbf9',
        color: '#0f1115',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '48px',
          gap: '16px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            gap: '17px',
          }}
        >
          <BeetIcon />
          <span
            style={{
              fontSize: '34px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
            }}
          >
            Root.js
          </span>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '68px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.08,
            color: '#0f1115',
          }}
        >
          Build. Edit. Ship.
        </h1>
      </div>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          marginTop: '36px',
          width: '1040px',
          height: '460px',
          borderTopLeftRadius: '14px',
          borderTopRightRadius: '14px',
          border: '1px solid #e4e4e1',
          borderBottom: 'none',
          background: '#ffffff',
          boxShadow:
            '0 1px 2px rgba(15, 17, 21, 0.06), 0 24px 60px -20px rgba(15, 17, 21, 0.24)',
        }}
      >
        <div
          style={{
            width: '1440px',
            height: '900px',
            transform: 'scale(0.72222222)',
            transformOrigin: 'top left',
          }}
        >
          <DesktopEditorPreview />
        </div>
      </div>
    </div>
  );
}
