/**
 * SVG illustrations for "Fernwood Market", the fictional garden store and
 * market used in the screenshot scenes. Drawing the art in code keeps the
 * scenes free of external image assets.
 */

export type VeggieKind =
  'carrot' | 'beet' | 'radish' | 'turnip' | 'parsnip' | 'sweetPotato';

const LEAF_GREEN = '#4f8a3c';
const LEAF_DARK = '#3a6b2c';

/** Three leaves fanning up from (50, 34). */
function Leaves(props: {color?: string; stem?: string; scale?: number}) {
  const color = props.color || LEAF_GREEN;
  const leaf = 'M50 36 C40 24 39 10 45 0 C53 9 56 22 50 36 Z';
  const s = props.scale || 1;
  return (
    <g transform={`translate(50 36) scale(${s}) translate(-50 -36)`}>
      {[-30, 0, 30].map((angle) => (
        <g transform={`rotate(${angle} 50 36)`}>
          {props.stem && (
            <path
              d="M50 36 L48 10"
              stroke={props.stem}
              stroke-width="2.5"
              stroke-linecap="round"
            />
          )}
          <path d={leaf} fill={angle === 0 ? LEAF_DARK : color} />
        </g>
      ))}
    </g>
  );
}

/**
 * A root vegetable drawn in a 100x120 coordinate space, so it can be placed in
 * other SVGs with a transform.
 */
export function VeggieShape(props: {kind: VeggieKind}) {
  switch (props.kind) {
    case 'carrot':
      return (
        <g>
          <Leaves />
          <path
            d="M34 38 Q50 28 66 38 Q62 70 52 110 Q50 116 48 110 Q38 70 34 38 Z"
            fill="#ef8a2b"
          />
          <path
            d="M40 54 L47 55 M56 66 L61 65 M44 80 L50 81 M53 94 L56 93"
            stroke="#c9661a"
            stroke-width="2"
            stroke-linecap="round"
          />
        </g>
      );
    case 'parsnip':
      return (
        <g>
          <Leaves scale={0.85} />
          <path
            d="M33 40 Q50 30 67 40 Q63 72 52 112 Q50 117 48 112 Q37 72 33 40 Z"
            fill="#eadcb2"
          />
          <path
            d="M41 56 L48 57 M55 70 L60 69 M46 88 L51 89"
            stroke="#c9b680"
            stroke-width="2"
            stroke-linecap="round"
          />
        </g>
      );
    case 'beet':
      return (
        <g>
          <Leaves color="#5b9444" stem="#a3244f" />
          <path
            d="M50 112 Q52 104 50 96"
            stroke="#7a1740"
            stroke-width="3"
            stroke-linecap="round"
            fill="none"
          />
          <circle cx="50" cy="70" r="28" fill="#8e1b4b" />
          <ellipse cx="40" cy="60" rx="8" ry="5" fill="#b43a6a" />
        </g>
      );
    case 'radish':
      return (
        <g>
          <Leaves scale={0.9} />
          <path
            d="M50 112 Q51 104 50 94"
            stroke="#f3e6e8"
            stroke-width="3"
            stroke-linecap="round"
            fill="none"
          />
          <circle cx="50" cy="70" r="24" fill="#e2456b" />
          <path d="M32 82 Q50 102 68 82 Q50 90 32 82 Z" fill="#fbecef" />
          <ellipse cx="41" cy="61" rx="6" ry="4" fill="#f07898" />
        </g>
      );
    case 'turnip':
      return (
        <g>
          <Leaves />
          <path
            d="M50 114 Q52 106 50 97"
            stroke="#d9d0c1"
            stroke-width="3"
            stroke-linecap="round"
            fill="none"
          />
          <circle cx="50" cy="70" r="28" fill="#f4efe4" />
          <path d="M22 68 A28 28 0 0 1 78 68 Q50 78 22 68 Z" fill="#7b3f98" />
        </g>
      );
    case 'sweetPotato':
      return (
        <g>
          <ellipse
            cx="50"
            cy="68"
            rx="20"
            ry="42"
            transform="rotate(-28 50 68)"
            fill="#b4533b"
          />
          <ellipse
            cx="42"
            cy="52"
            rx="5"
            ry="10"
            transform="rotate(-28 42 52)"
            fill="#c96c52"
          />
          <circle cx="58" cy="80" r="2" fill="#8c3d2a" />
          <circle cx="47" cy="72" r="1.6" fill="#8c3d2a" />
        </g>
      );
  }
}

/** A standalone vegetable illustration. */
export function Veggie(props: {
  kind: VeggieKind;
  size?: number;
  style?: preact.JSX.CSSProperties;
}) {
  const size = props.size || 64;
  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 100 120"
      style={props.style}
      aria-hidden="true"
    >
      <VeggieShape kind={props.kind} />
    </svg>
  );
}

/** Background tints paired with each vegetable for product tiles. */
export const VEGGIE_TINTS: Record<VeggieKind, string> = {
  carrot: '#fdebd6',
  parsnip: '#f6f0dc',
  beet: '#f7dfe8',
  radish: '#fde4ea',
  turnip: '#ece3f3',
  sweetPotato: '#f8e3dc',
};

/**
 * A sunny garden bed with rows of vegetables and a harvest crate. Used as the
 * hero image of the fictional storefront.
 */
export function GardenScene(props: {
  className?: string;
  style?: preact.JSX.CSSProperties;
}) {
  const rows = [
    {y: 176, kind: 'carrot' as VeggieKind, scale: 0.34, count: 9},
    {y: 206, kind: 'beet' as VeggieKind, scale: 0.4, count: 8},
    {y: 240, kind: 'radish' as VeggieKind, scale: 0.46, count: 7},
  ];
  return (
    <svg
      className={props.className}
      style={props.style}
      viewBox="0 0 600 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="garden-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fbe3c0" />
          <stop offset="1" stop-color="#fdf4e3" />
        </linearGradient>
      </defs>
      <rect width="600" height="300" fill="url(#garden-sky)" />
      <circle cx="470" cy="70" r="38" fill="#ffd27d" />
      <path
        d="M0 150 Q120 105 240 138 T480 128 T600 132 V300 H0 Z"
        fill="#b9d3a4"
      />
      <path d="M0 168 Q150 140 300 160 T600 150 V300 H0 Z" fill="#8fb97a" />
      <rect y="170" width="600" height="130" fill="#7a5237" />
      {rows.map((row, r) => (
        <g>
          <rect
            y={row.y + 10}
            width="600"
            height="16"
            fill={r % 2 ? '#6a4630' : '#86593b'}
          />
          {Array.from({length: row.count}).map((_, i) => {
            const x = 28 + i * (560 / row.count) + (r % 2) * 22;
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
      <g transform="translate(360 214)">
        <rect width="190" height="74" rx="4" fill="#c58c57" />
        <g transform="translate(18 -46) scale(0.5) rotate(-18 50 60)">
          <VeggieShape kind="carrot" />
        </g>
        <g transform="translate(52 -40) scale(0.46)">
          <VeggieShape kind="beet" />
        </g>
        <g transform="translate(90 -36) scale(0.42)">
          <VeggieShape kind="turnip" />
        </g>
        <g transform="translate(126 -44) scale(0.5) rotate(16 50 60)">
          <VeggieShape kind="parsnip" />
        </g>
        <rect y="10" width="190" height="64" rx="4" fill="#c58c57" />
        <rect y="30" width="190" height="4" fill="#a8703f" />
        <rect y="52" width="190" height="4" fill="#a8703f" />
        <text
          x="95"
          y="26"
          text-anchor="middle"
          font-family="Inter, sans-serif"
          font-size="11"
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

/** A sprout logo mark for the storefront header. */
export function SproutMark(props: {size?: number}) {
  const size = props.size || 14;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22 V11" stroke="#3a6b2c" stroke-width="2.4" />
      <path d="M12 12 C12 6 7 3 2 4 C2 9 6 12 12 12 Z" fill="#4f8a3c" />
      <path d="M12 10 C12 5 16 2 22 2 C22 7 18 10 12 10 Z" fill="#6aa84f" />
    </svg>
  );
}
