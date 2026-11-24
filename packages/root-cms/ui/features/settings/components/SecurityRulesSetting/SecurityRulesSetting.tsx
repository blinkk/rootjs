import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {
  FIRESTORE_RULES,
  FIRESTORE_RULES_VERSION,
  ROOT_CMS_RULES_END,
  ROOT_CMS_RULES_START,
} from '../../../../../shared/security-rules.js';
import {Text} from '../../../../components/Text/Text.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {useSecurityRulesStatus} from '../../security-rules.js';

const CLI_COMMAND = 'npx root-cms update-firebase-security-rules';

/**
 * Admin-only setting in Settings → Site Admin that displays the deployed
 * Firestore security rules version and lets admins apply or copy updates while
 * preserving custom rules outside the Root.js CMS START/END markers.
 */
export function SecurityRulesSetting() {
  const {status, loading, applying, refresh, apply} = useSecurityRulesStatus();
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  useEffect(() => {
    if (window.location.hash === '#security-rules') {
      document.getElementById('security-rules')?.scrollIntoView();
    }
  }, []);

  const gcpProjectId =
    status?.gcpProjectId || window.__ROOT_CTX?.firebaseConfig?.projectId || '';
  const consoleUrl = gcpProjectId
    ? `https://console.firebase.google.com/project/${encodeURIComponent(gcpProjectId)}/firestore/rules`
    : '';

  async function onApply() {
    setApplyError(null);
    const res = await apply();
    if (res.success && res.data) {
      showNotification({
        title: 'Firestore security rules updated',
        message: res.data.preservedCustomRules
          ? `Updated to v${res.data.version} (custom rules preserved).`
          : `Updated to v${res.data.version}.`,
        color: 'green',
        autoClose: 4000,
      });
      return;
    }
    const message =
      res.error === 'PERMISSION_DENIED'
        ? 'The CMS server credentials do not have permission to update Firebase Security Rules. Run the CLI command below locally instead.'
        : res.message || 'Failed to update Firestore security rules.';
    setApplyError(message);
  }

  async function onRefresh() {
    setApplyError(null);
    await refresh();
  }

  async function onCopyCommand() {
    await navigator.clipboard.writeText(CLI_COMMAND);
    setCopiedCommand(true);
    window.setTimeout(() => setCopiedCommand(false), 2000);
  }

  async function onCopyRules() {
    await navigator.clipboard.writeText(FIRESTORE_RULES);
    setCopiedRules(true);
    window.setTimeout(() => setCopiedRules(false), 2000);
  }

  let badge = null;
  if (status?.status === 'up_to_date') {
    badge = (
      <Badge tone="success">
        Up to date (v{status.deployedVersion ?? FIRESTORE_RULES_VERSION})
      </Badge>
    );
  } else if (status?.status === 'outdated') {
    const fromLabel =
      status.deployedVersion !== null
        ? `v${status.deployedVersion}`
        : 'unversioned';
    badge = (
      <Badge tone="warning">
        Update available ({fromLabel} → v{status.latestVersion})
      </Badge>
    );
  } else if (status?.status === 'unavailable') {
    badge = <Badge tone="neutral">Unable to verify</Badge>;
  }

  const canOneClickApply =
    status?.status !== 'up_to_date' &&
    !(status?.status === 'outdated' && !status.canAutoMerge);

  return (
    <div
      id="security-rules"
      className="SecurityRulesSetting SettingsPage__setting flex flex-col gap-1.5 border-b border-border pb-6 last:border-b-0 last:pb-0"
    >
      <div className="SecurityRulesSetting__header flex flex-wrap items-center gap-2">
        <Text size="body" weight="semi-bold">
          Firestore security rules
        </Text>
        {badge}
      </div>
      <Text size="body-sm" weight="semi-bold" color="gray">
        <p>
          Root.js CMS manages the rules between{' '}
          <code className="font-mono">{ROOT_CMS_RULES_START}</code> and{' '}
          <code className="font-mono">{ROOT_CMS_RULES_END}</code> (latest: v
          {FIRESTORE_RULES_VERSION}). Custom rules outside those comments are
          preserved when updating.
        </p>
      </Text>

      {status?.status === 'outdated' &&
        !status.canAutoMerge &&
        status.reason && (
          <div className="SecurityRulesSetting__notice mt-1 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-fg">
            {status.reason}
          </div>
        )}

      {applyError && (
        <div className="SecurityRulesSetting__error mt-1 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg">
          {applyError}
        </div>
      )}

      <div className="SecurityRulesSetting__actions mt-2 flex flex-wrap gap-2">
        {canOneClickApply && (
          <Button
            size="xs"
            variant="primary"
            icon={<IconShieldCheck size={14} stroke={1.75} />}
            loading={applying}
            onClick={onApply}
          >
            Apply v{FIRESTORE_RULES_VERSION} rules
          </Button>
        )}
        <Button
          size="xs"
          icon={<IconRefresh size={14} stroke={1.75} />}
          loading={loading}
          onClick={onRefresh}
        >
          Re-check
        </Button>
        <Button
          size="xs"
          icon={
            copiedRules ? (
              <IconCheck size={14} stroke={1.75} />
            ) : (
              <IconCopy size={14} stroke={1.75} />
            )
          }
          onClick={onCopyRules}
        >
          {copiedRules ? 'Copied rules' : 'Copy latest rules'}
        </Button>
        {consoleUrl && (
          <Button
            size="xs"
            iconRight={<IconExternalLink size={14} stroke={1.75} />}
            href={consoleUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Firebase Console
          </Button>
        )}
      </div>

      <div className="SecurityRulesSetting__cli mt-2 flex flex-col gap-1">
        <Text size="body-sm" color="gray">
          Or update from your terminal (fetches live rules and preserves custom
          rules outside the markers):
        </Text>
        <div className="SecurityRulesSetting__cliBox flex items-center justify-between gap-2 rounded-md border border-border bg-chip px-3 py-1.5 font-mono text-xs text-fg">
          <code className="SecurityRulesSetting__cliCode min-w-0 truncate">
            {CLI_COMMAND}
          </code>
          <IconButton
            className="SecurityRulesSetting__cliCopy shrink-0"
            label={copiedCommand ? 'Copied' : 'Copy command'}
            size="xs"
            onClick={onCopyCommand}
          >
            {copiedCommand ? (
              <IconCheck size={14} stroke={1.75} />
            ) : (
              <IconCopy size={14} stroke={1.75} />
            )}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
