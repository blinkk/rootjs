import {IconAlertTriangle, IconX} from '@tabler/icons-preact';
import {FIRESTORE_RULES_VERSION} from '../../../shared/security-rules.js';
import {useSecurityRulesStatus} from '../../features/settings/security-rules.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {IconButton} from '../../primitives/IconButton/IconButton.js';

/**
 * Returns whether the security rules outdated banner should be displayed for
 * the current admin user.
 */
export function useSecurityRulesBanner() {
  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
  const {isAdmin, status} = useSecurityRulesStatus();
  const [dismissed, setDismissed] = useLocalStorage<boolean>(
    `root-cms::dismissed-security-rules-banner::${projectId}::v${FIRESTORE_RULES_VERSION}`,
    false
  );
  const visible = isAdmin && status?.status === 'outdated' && !dismissed;
  return {
    visible,
    status,
    dismiss: () => setDismissed(true),
  };
}

/**
 * Admin-only dismissible banner alerting when deployed Firestore security
 * rules are behind the latest version bundled with Root.js CMS.
 */
export function SecurityRulesBanner(props: {
  deployedVersion: number | null;
  latestVersion: number;
  onDismiss: () => void;
}) {
  const versionDetail =
    props.deployedVersion !== null
      ? `v${props.deployedVersion} → v${props.latestVersion}`
      : `unversioned → v${props.latestVersion}`;

  return (
    <div
      className="SecurityRulesBanner Layout__banner flex min-h-9 items-center gap-2 border-b border-warning-line bg-warning-soft px-3 py-1.5 text-sm text-fg"
      role="status"
    >
      <IconAlertTriangle
        size={16}
        stroke={1.75}
        className="SecurityRulesBanner__icon shrink-0 text-warning"
        aria-hidden="true"
      />
      <span className="SecurityRulesBanner__message min-w-0 flex-1 truncate">
        Firestore security rules are out of date ({versionDetail}).{' '}
        <a
          className="SecurityRulesBanner__link font-semibold text-strong underline hover:text-link"
          href="/cms/settings#security-rules"
        >
          Review &amp; update in Settings
        </a>
      </span>
      <IconButton
        className="SecurityRulesBanner__dismiss shrink-0"
        label="Dismiss"
        size="xs"
        tooltip={false}
        onClick={props.onDismiss}
      >
        <IconX size={14} stroke={1.75} />
      </IconButton>
    </div>
  );
}
