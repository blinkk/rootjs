import {
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
  IconRocket,
  IconX,
} from '@tabler/icons-preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {
  Badge,
  type BadgeGradient,
  type BadgeTone,
  type BadgeVariant,
} from './Badge.js';

const TONES: BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];
const VARIANTS: BadgeVariant[] = ['soft', 'filled', 'outline'];
const GRADIENTS: Array<[BadgeGradient, string]> = [
  ['blue', 'Draft'],
  ['green', 'Published'],
  ['pink', 'Scheduled'],
  ['orange', 'Locked'],
  ['yellow', 'Pending'],
  ['red', 'High'],
  ['violet', 'Release'],
  ['gray', 'Archived'],
];

export const BadgeGallery = defineGallery({
  id: 'badge',
  name: 'Badge',
  group: 'Primitives',
  stories: {
    'Tones and variants': () => (
      <div className="flex flex-col gap-3">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-2">
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} variant={variant}>
                {tone}
              </Badge>
            ))}
          </div>
        ))}
      </div>
    ),
    Gradients: () => (
      <div className="flex flex-wrap items-center gap-2">
        {GRADIENTS.map(([gradient, label]) => (
          <Badge key={gradient} variant="gradient" gradient={gradient}>
            {label}
          </Badge>
        ))}
        <Badge
          variant="gradient"
          gradient="green"
          size="xs"
          icon={<IconCheck />}
        >
          Done
        </Badge>
      </div>
    ),
    Sizes: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="xs">Extra small</Badge>
        <Badge size="sm">Small</Badge>
        <Badge size="xs" variant="filled">
          get_doc
        </Badge>
        <Badge size="xs" tone="info" variant="outline">
          Modified
        </Badge>
      </div>
    ),
    'With icons': () => (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success" variant="filled" icon={<IconCheck />}>
          Success
        </Badge>
        <Badge tone="warning" variant="filled" icon={<IconAlertTriangle />}>
          Warning
        </Badge>
        <Badge tone="danger" variant="filled" icon={<IconX />}>
          Error
        </Badge>
        <Badge tone="info" icon={<IconInfoCircle />}>
          Scheduled
        </Badge>
      </div>
    ),
    'As a link, long label': () => (
      <div className="flex max-w-xs flex-col items-start gap-2">
        <Badge href="#release" tone="info" icon={<IconRocket />}>
          Release: spring-launch
        </Badge>
        <Badge tone="neutral">
          A very long badge label that truncates instead of wrapping
        </Badge>
      </div>
    ),
  },
});
