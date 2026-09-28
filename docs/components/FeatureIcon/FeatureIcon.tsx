import {
  IconBolt,
  IconBraces,
  IconBrain,
  IconCalendarEvent,
  IconChecklist,
  IconCloudUpload,
  IconCode,
  IconComponents,
  IconDatabase,
  IconDeviceDesktop,
  IconGitPullRequest,
  IconHistory,
  IconKey,
  IconLanguage,
  IconLayoutSidebar,
  IconLock,
  IconMessageCircle,
  IconPalette,
  IconPhoto,
  IconPlug,
  IconRocket,
  IconRoute,
  IconSearch,
  IconServer,
  IconSitemap,
  IconSparkles,
  IconTerminal2,
  IconUsers,
  IconWorld,
} from '@tabler/icons-preact';
import {FunctionalComponent} from 'preact';
import type {FeatureIconKey} from '@/fields/featureIconField.js';

/** Icon components for each key in `FEATURE_ICON_KEYS`. */
const FEATURE_ICONS: Record<FeatureIconKey, FunctionalComponent<any>> = {
  ai: IconSparkles,
  assets: IconPhoto,
  bolt: IconBolt,
  brain: IconBrain,
  checks: IconChecklist,
  cloud: IconCloudUpload,
  code: IconCode,
  comments: IconMessageCircle,
  components: IconComponents,
  data: IconDatabase,
  history: IconHistory,
  i18n: IconWorld,
  key: IconKey,
  lock: IconLock,
  palette: IconPalette,
  plug: IconPlug,
  preview: IconDeviceDesktop,
  proposal: IconGitPullRequest,
  release: IconCalendarEvent,
  rocket: IconRocket,
  route: IconRoute,
  schema: IconBraces,
  search: IconSearch,
  server: IconServer,
  sidebar: IconLayoutSidebar,
  sitemap: IconSitemap,
  terminal: IconTerminal2,
  translate: IconLanguage,
  users: IconUsers,
};

export interface FeatureIconProps {
  icon?: string;
  className?: string;
  size?: number;
}

/** Renders one of the curated `FEATURE_ICONS` by key. */
export function FeatureIcon(props: FeatureIconProps) {
  const Icon = props.icon && FEATURE_ICONS[props.icon as FeatureIconKey];
  if (!Icon) {
    return null;
  }
  return (
    <Icon
      className={props.className}
      size={props.size || 24}
      stroke={1.6}
      aria-hidden="true"
    />
  );
}
