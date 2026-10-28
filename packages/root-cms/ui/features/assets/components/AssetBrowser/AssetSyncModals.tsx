import {
  IconAlertTriangle,
  IconBrandFigma,
  IconBrandGoogleDrive,
  IconCircleCheck,
  IconCirclePlus,
  IconCircleX,
  IconCloudDownload,
  IconEqual,
  IconFileX,
  IconRefresh,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {syncFolder} from '../../asset-sync/engine.js';
import {
  getSyncProvider,
  parseSyncSourceUrl,
} from '../../asset-sync/registry.js';
import {getProviderToken, setProviderToken} from '../../asset-sync/tokens.js';
import {
  AssetSyncProvider,
  SyncInProgressError,
  SyncProgress,
  SyncSummary,
  SyncTokenRequiredError,
} from '../../asset-sync/types.js';
import {
  AssetFolder,
  connectFolderSync,
  disconnectFolderSync,
  joinFolderPath,
} from '../../assets.js';

/** Renders the icon for a sync provider. */
export function SyncProviderIcon(props: {provider?: string; size?: number}) {
  const size = props.size ?? 14;
  if (props.provider === 'figma') {
    return <IconBrandFigma size={size} />;
  }
  if (props.provider === 'gdrive') {
    return <IconBrandGoogleDrive size={size} />;
  }
  return <IconCloudDownload size={size} />;
}

/** Muted explanatory text in the sync modals. */
const TEXT_CLASSES = 'AssetBrowser__syncModal__text text-base text-muted';

/** Small help text under a token input. */
const HELP_CLASSES = 'AssetBrowser__syncModal__tokenHelp text-sm text-muted';

/** Error callout in the sync modals. */
const ERROR_CLASSES =
  'AssetBrowser__syncModal__error rounded-sm bg-danger-soft px-3 py-2 text-base text-danger wrap-anywhere';

/** Right-aligned row of modal buttons. */
const BUTTONS_CLASSES =
  'AssetBrowser__syncModal__buttons flex flex-wrap justify-end gap-2';

/** An inline, underlined text button. */
const LINK_BUTTON_CLASSES =
  'AssetBrowser__syncModal__linkButton m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 font-sans text-sm text-inherit underline';

/**
 * Modal for connecting a folder to an external sync source (or changing /
 * disconnecting an existing connection). The user pastes a source URL
 * (auto-detecting the provider) and, when needed, their personal access
 * token for the provider. Tokens are stored only in this browser -- each
 * user needs their own token, so only users with access to the source can
 * sync it.
 */
export function ConnectSyncModal(props: {
  folder: AssetFolder;
  onClose: () => void;
  /** Called after the connection is saved. `runSync` requests an immediate sync. */
  onConnected: (folder: AssetFolder, runSync: boolean) => void;
  /** Called after the folder is disconnected from its source. */
  onDisconnected: () => void;
}) {
  const folder = props.folder;
  const existingSync = folder.sync;
  const [url, setUrl] = useState(existingSync?.url || '');
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');

  const parsed = useMemo(() => parseSyncSourceUrl(url), [url]);
  const provider: AssetSyncProvider | null = parsed?.provider || null;
  const isOAuth = provider?.authType === 'oauth';
  const hasStoredToken =
    provider && !isOAuth ? !!getProviderToken(provider.id) : false;
  const showTokenSection =
    !!provider && !isOAuth && (!hasStoredToken || showTokenInput);
  const folderPath = joinFolderPath(folder.parent, folder.name);

  async function onSubmit() {
    setError('');
    if (!url.trim()) {
      setError('Paste a source URL, e.g. a link to a Figma file or node.');
      return;
    }
    if (!parsed || !provider) {
      setError(
        'URL not recognized. Paste a link to a Figma file, or a specific node (right-click a frame in Figma → "Copy link to selection").'
      );
      return;
    }
    setSubmitting(true);
    try {
      if (isOAuth) {
        // Interactive sign-in must happen within the submit click gesture
        // so the popup isn't blocked. With prior consent this is silent.
        if (provider.interactiveLogin) {
          await provider.interactiveLogin();
        }
      } else {
        const token = tokenInput.trim();
        if (token) {
          if (provider.validateToken) {
            const check = await provider.validateToken(token, parsed.source);
            if (!check.valid) {
              setError(
                check.error ||
                  `The ${provider.label} token appears to be invalid. Check the token and try again.`
              );
              setSubmitting(false);
              return;
            }
          }
          setProviderToken(provider.id, token);
        } else if (!hasStoredToken) {
          setError(`Enter your ${provider.label} access token.`);
          setSubmitting(false);
          return;
        }
      }
      const updated = await connectFolderSync(folder, parsed.source);
      showNotification({
        message: `Connected "${folderPath}" to ${provider.label}.`,
        color: 'green',
      });
      props.onConnected(updated, true);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
    setSubmitting(false);
  }

  async function onDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectFolderSync(folder);
      showNotification({
        message: `Disconnected "${folderPath}" from its sync source. Synced assets were kept.`,
      });
      props.onDisconnected();
    } catch (err: any) {
      setError(String(err?.message || err));
      setDisconnecting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={
        existingSync
          ? `Sync settings for "${folder.name}"`
          : `Connect "${folder.name}" to a source`
      }
      size="lg"
      centered
    >
      <form
        className="AssetBrowser__syncModal flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className={TEXT_CLASSES}>
          Sync assets from an external source into this folder — the exportable
          assets of a Figma file or node, or the files of a Google Drive folder.
          The connection is saved with this folder and can be re-synced when the
          source changes.
        </div>
        <TextInput
          data-autofocus
          size="md"
          label="Source URL"
          placeholder="https://www.figma.com/design/… or https://drive.google.com/drive/folders/…"
          description={
            provider
              ? `Source: ${provider.label}`
              : 'Link to a Figma file/node ("Copy link to selection" in Figma) or a Google Drive folder.'
          }
          value={url}
          onInput={(e) => setUrl(e.currentTarget.value)}
        />
        {isOAuth && provider?.tokenHelp && (
          <div className={HELP_CLASSES}>{provider.tokenHelp.text}</div>
        )}
        {showTokenSection && provider && (
          <div className="AssetBrowser__syncModal__token flex flex-col gap-2">
            <TextInput
              type="password"
              size="md"
              label={`${provider.label} access token`}
              placeholder="Personal access token"
              value={tokenInput}
              onInput={(e) => setTokenInput(e.currentTarget.value)}
            />
            {provider.tokenHelp && (
              <div className={HELP_CLASSES}>
                {provider.tokenHelp.text}{' '}
                {provider.tokenHelp.url && (
                  <a
                    href={provider.tokenHelp.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Learn more
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        {!showTokenSection && provider && hasStoredToken && (
          <div className="AssetBrowser__syncModal__tokenSaved text-sm text-muted">
            Using the {provider.label} token saved in this browser.{' '}
            <button
              type="button"
              className={LINK_BUTTON_CLASSES}
              onClick={() => setShowTokenInput(true)}
            >
              Change token
            </button>
          </div>
        )}
        {error && <div className={ERROR_CLASSES}>{error}</div>}
        <div className={BUTTONS_CLASSES}>
          {existingSync && (
            <Button
              type="button"
              variant="danger-outline"
              size="md"
              loading={disconnecting}
              disabled={submitting}
              onClick={() => onDisconnect()}
            >
              Disconnect
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={disconnecting}
          >
            {existingSync ? 'Save & sync now' : 'Connect & sync now'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type SyncRunStatus = 'running' | 'token' | 'conflict' | 'done' | 'error';

/**
 * Modal that runs a folder sync and reports progress + a result summary.
 * Handles the token prompt (missing/expired token) and the concurrent-sync
 * confirmation inline.
 */
export function SyncProgressModal(props: {
  folder: AssetFolder;
  onClose: () => void;
  /** Called when a run finishes (successfully or not) so the listing reloads. */
  onSynced: () => void;
}) {
  const folder = props.folder;
  const [status, setStatus] = useState<SyncRunStatus>('running');
  const [progress, setProgress] = useState<SyncProgress>({
    phase: 'enumerating',
  });
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<SyncInProgressError | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const startedRef = useRef(false);

  const provider = getSyncProvider(folder.sync?.provider || '');

  async function run(options?: {force?: boolean}) {
    setStatus('running');
    setError('');
    setProgress({phase: 'enumerating'});
    try {
      const res = await syncFolder({
        folder: folder,
        force: options?.force,
        onProgress: setProgress,
      });
      setSummary(res);
      setStatus('done');
      props.onSynced();
    } catch (err: any) {
      if (err instanceof SyncTokenRequiredError) {
        setError(err.message === 'A token is required.' ? '' : err.message);
        setStatus('token');
        return;
      }
      if (err instanceof SyncInProgressError) {
        setConflict(err);
        setStatus('conflict');
        return;
      }
      console.error('sync failed:', err);
      setError(String(err?.message || err));
      setStatus('error');
      // Per-item work may have partially completed before the failure.
      props.onSynced();
    }
  }

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      run();
    }
  }, []);

  async function saveTokenAndRetry() {
    const token = tokenInput.trim();
    if (!token || !provider) {
      return;
    }
    setSavingToken(true);
    try {
      if (provider.validateToken) {
        const check = await provider.validateToken(token, folder.sync);
        if (!check.valid) {
          setError(
            check.error ||
              `The ${provider.label} token appears to be invalid. Check the token and try again.`
          );
          setSavingToken(false);
          return;
        }
      }
      setProviderToken(provider.id, token);
      setTokenInput('');
      setSavingToken(false);
      run();
    } catch (err: any) {
      setError(String(err?.message || err));
      setSavingToken(false);
    }
  }

  /** OAuth providers: interactive sign-in (within the click gesture). */
  async function signInAndRetry() {
    if (!provider?.interactiveLogin) {
      return;
    }
    setSavingToken(true);
    setError('');
    try {
      await provider.interactiveLogin();
      setSavingToken(false);
      run();
    } catch (err: any) {
      setError(String(err?.message || err));
      setSavingToken(false);
    }
  }

  const running = status === 'running';

  return (
    <Dialog
      open
      onClose={props.onClose}
      closeOnClickOutside={!running}
      closeOnEscape={!running}
      withCloseButton={!running}
      title={`Syncing "${folder.name}"`}
      size="md"
      centered
    >
      <div className="AssetBrowser__syncProgress flex flex-col gap-4">
        {status === 'running' && <SyncRunningView progress={progress} />}

        {status === 'token' && provider && provider.authType === 'oauth' && (
          <div className="AssetBrowser__syncProgress__token flex flex-col gap-4">
            <div className={TEXT_CLASSES}>
              {provider.tokenHelp?.text ||
                `Sign in to ${provider.label} to sync. Only your account's access to the source is used.`}
            </div>
            {error && <div className={ERROR_CLASSES}>{error}</div>}
            <div className={BUTTONS_CLASSES}>
              <Button size="md" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={savingToken}
                onClick={() => signInAndRetry()}
              >
                {provider.loginLabel || `Sign in to ${provider.label}`}
              </Button>
            </div>
          </div>
        )}

        {status === 'token' && provider && provider.authType !== 'oauth' && (
          <div className="AssetBrowser__syncProgress__token flex flex-col gap-4">
            <div className={TEXT_CLASSES}>
              A {provider.label} access token is needed to sync. Your token is
              stored only in this browser and is used to verify you have access
              to the source.
            </div>
            <TextInput
              type="password"
              data-autofocus
              size="md"
              label={`${provider.label} access token`}
              placeholder="Personal access token"
              value={tokenInput}
              onInput={(e) => setTokenInput(e.currentTarget.value)}
            />
            {provider.tokenHelp && (
              <div className={HELP_CLASSES}>
                {provider.tokenHelp.text}{' '}
                {provider.tokenHelp.url && (
                  <a
                    href={provider.tokenHelp.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Learn more
                  </a>
                )}
              </div>
            )}
            {error && <div className={ERROR_CLASSES}>{error}</div>}
            <div className={BUTTONS_CLASSES}>
              <Button size="md" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={savingToken}
                disabled={!tokenInput.trim()}
                onClick={() => saveTokenAndRetry()}
              >
                Save token & sync
              </Button>
            </div>
          </div>
        )}

        {status === 'conflict' && conflict && (
          <div className="AssetBrowser__syncProgress__conflict flex flex-col gap-4">
            <div className={TEXT_CLASSES}>
              A sync started by <b>{conflict.startedBy}</b> appears to be in
              progress. Running two syncs at once is usually harmless but may
              duplicate work.
            </div>
            <div className={BUTTONS_CLASSES}>
              <Button size="md" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => run({force: true})}
              >
                Sync anyway
              </Button>
            </div>
          </div>
        )}

        {status === 'done' && summary && (
          <div className="AssetBrowser__syncProgress__done flex flex-col gap-4">
            <SyncSummaryView summary={summary} />
            <div className={BUTTONS_CLASSES}>
              {summary.failed.length > 0 && (
                <Button size="md" onClick={() => run()}>
                  Retry failed
                </Button>
              )}
              <Button variant="primary" size="md" onClick={props.onClose}>
                Done
              </Button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="AssetBrowser__syncProgress__error flex flex-col gap-4">
            <div className={ERROR_CLASSES}>{error}</div>
            <div className={BUTTONS_CLASSES}>
              <Button size="md" onClick={props.onClose}>
                Close
              </Button>
              <Button variant="primary" size="md" onClick={() => run()}>
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Headline describing what the sync is currently doing. */
function syncPhaseLabel(progress: SyncProgress): string {
  if (progress.phase === 'enumerating') {
    return 'Finding exportable assets…';
  }
  if (progress.phase === 'finalizing') {
    return 'Finishing up…';
  }
  return progress.total ? 'Importing assets…' : 'Importing…';
}

/**
 * Live progress for a running sync. The bar is determinate once the number
 * of items to import is known, and animates as an indeterminate sweep while
 * the source is still being enumerated. Transient provider status (e.g. a
 * rate-limit backoff countdown) replaces the current item line.
 */
export function SyncRunningView(props: {progress: SyncProgress}) {
  const progress = props.progress;
  const total = progress.total ?? 0;
  const completed = Math.min(progress.completed ?? 0, total);
  const determinate = progress.phase === 'downloading' && total > 0;
  const finalizing = progress.phase === 'finalizing';
  const indeterminate = !determinate && !finalizing;
  const percent = determinate ? Math.round((completed / total) * 100) : 100;
  const label = syncPhaseLabel(progress);
  return (
    <div className="AssetBrowser__syncProgress__running flex flex-col gap-2 py-2">
      <div className="AssetBrowser__syncProgress__status flex items-baseline justify-between gap-3">
        <div className="AssetBrowser__syncProgress__phase min-w-0 text-base font-medium wrap-anywhere">
          {label}
        </div>
        {determinate && (
          <div className="AssetBrowser__syncProgress__count shrink-0 text-sm tabular-nums text-muted">
            {completed} / {total}
          </div>
        )}
      </div>
      <div
        className={cn(
          'AssetBrowser__syncProgress__bar',
          'relative h-1.5 overflow-hidden rounded-full bg-surface-active',
          indeterminate && 'AssetBrowser__syncProgress__bar--indeterminate'
        )}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? percent : undefined}
      >
        <div
          className="AssetBrowser__syncProgress__barFill h-full rounded-full bg-fg transition-all duration-200 ease-in-out"
          style={indeterminate ? undefined : {width: `${percent}%`}}
        />
      </div>
      <div className="AssetBrowser__syncProgress__detail min-h-4.5 text-sm">
        {progress.note ? (
          <span className="AssetBrowser__syncProgress__note inline-flex items-center gap-1 text-warning">
            <IconAlertTriangle className="shrink-0" size={14} />
            {progress.note}
          </span>
        ) : (
          progress.currentName && (
            <span className="AssetBrowser__syncProgress__current block truncate text-muted">
              {progress.currentName}
            </span>
          )
        )}
      </div>
    </div>
  );
}

type SyncStatTone = 'added' | 'updated' | 'unchanged' | 'missing' | 'failed';

/** A single count in the completed-sync stat grid. */
function SyncStat(props: {
  icon: ComponentChildren;
  label: string;
  value: number;
  tone: SyncStatTone;
}) {
  const zero = props.value === 0;
  // Zero counts are de-emphasized so the meaningful numbers stand out; the
  // missing and failed tones are only shown when non-zero.
  const mutedIcon = zero && props.tone !== 'missing' && props.tone !== 'failed';
  const iconClasses: Record<SyncStatTone, string> = {
    added: mutedIcon ? 'text-muted' : 'text-success',
    updated: mutedIcon ? 'text-muted' : 'text-link',
    unchanged: 'text-muted',
    missing: 'text-warning',
    failed: 'text-danger',
  };
  return (
    <div
      className={cn(
        'AssetBrowser__syncStat',
        `AssetBrowser__syncStat--${props.tone}`,
        zero && 'AssetBrowser__syncStat--zero opacity-60',
        'flex min-w-19 flex-1 basis-19 flex-col items-center gap-0.5 rounded-md border border-border px-2 py-2.5',
        zero ? 'text-muted' : 'text-fg'
      )}
    >
      <div
        className={cn(
          'AssetBrowser__syncStat__icon flex',
          iconClasses[props.tone]
        )}
      >
        {props.icon}
      </div>
      <div className="AssetBrowser__syncStat__value text-xl font-semibold leading-tight tabular-nums">
        {props.value}
      </div>
      <div className="AssetBrowser__syncStat__label text-xs uppercase tracking-wider text-muted">
        {props.label}
      </div>
    </div>
  );
}

/** Classes shared by the summary's warning and error callouts. */
const CALLOUT_CLASSES =
  'AssetBrowser__syncSummary__callout flex items-start gap-2 rounded-md px-3 py-2.5 text-base';

/** Number of failed items listed before the "show all" toggle. */
const FAILED_PREVIEW_COUNT = 5;

/**
 * Result of a completed sync: a status banner, a grid of per-outcome counts,
 * and callouts for the outcomes that need follow-up (assets no longer at the
 * source, and per-item failures).
 */
export function SyncSummaryView(props: {summary: SyncSummary}) {
  const summary = props.summary;
  const [showAllFailed, setShowAllFailed] = useState(false);
  const failedCount = summary.failed.length;
  const changed = summary.added + summary.updated;
  const docCount = new Set(summary.updatedDocIds).size;
  const visibleFailed = showAllFailed
    ? summary.failed
    : summary.failed.slice(0, FAILED_PREVIEW_COUNT);

  let tone: 'success' | 'warning' | 'neutral' = 'success';
  let title = 'Sync complete';
  let subtitle = `${summary.added} added, ${summary.updated} updated.`;
  if (failedCount > 0) {
    tone = 'warning';
    title = `Synced with ${failedCount} error${failedCount === 1 ? '' : 's'}`;
    subtitle = 'Syncing again will retry the items that failed.';
  } else if (summary.upToDate) {
    tone = 'neutral';
    title = 'Everything is up to date';
    subtitle = "The source hasn't changed since the last sync.";
  } else if (changed === 0) {
    tone = 'neutral';
    title = 'No changes to import';
    subtitle = 'Every asset already matches the source.';
  }

  return (
    <div className="AssetBrowser__syncSummary flex flex-col gap-3">
      <div
        className={cn(
          'AssetBrowser__syncSummary__banner',
          `AssetBrowser__syncSummary__banner--${tone}`,
          'flex items-start gap-2.5 rounded-md p-3',
          tone === 'success' && 'bg-success-soft text-success',
          tone === 'warning' && 'bg-warning-soft text-warning',
          tone === 'neutral' && 'bg-chip text-muted'
        )}
      >
        {tone === 'warning' ? (
          <IconAlertTriangle className="mt-px shrink-0" size={20} />
        ) : (
          <IconCircleCheck className="mt-px shrink-0" size={20} />
        )}
        <div className="AssetBrowser__syncSummary__bannerText min-w-0">
          <div className="AssetBrowser__syncSummary__title text-base font-semibold">
            {title}
          </div>
          <div className="AssetBrowser__syncSummary__subtitle mt-0.5 text-sm text-muted">
            {subtitle}
          </div>
        </div>
      </div>

      <div className="AssetBrowser__syncSummary__stats flex flex-wrap gap-2">
        <SyncStat
          tone="added"
          icon={<IconCirclePlus size={16} />}
          label="Added"
          value={summary.added}
        />
        <SyncStat
          tone="updated"
          icon={<IconRefresh size={16} />}
          label="Updated"
          value={summary.updated}
        />
        <SyncStat
          tone="unchanged"
          icon={<IconEqual size={16} />}
          label="Unchanged"
          value={summary.unchanged}
        />
        {summary.missing > 0 && (
          <SyncStat
            tone="missing"
            icon={<IconFileX size={16} />}
            label="Missing"
            value={summary.missing}
          />
        )}
        {failedCount > 0 && (
          <SyncStat
            tone="failed"
            icon={<IconCircleX size={16} />}
            label="Failed"
            value={failedCount}
          />
        )}
      </div>

      {docCount > 0 && (
        <div className="AssetBrowser__syncSummary__note flex items-center gap-1.5 text-sm text-muted">
          <IconRefresh className="shrink-0" size={14} />
          Refreshed in {docCount} document{docCount === 1 ? '' : 's'}.
        </div>
      )}

      {summary.missing > 0 && (
        <div
          className={cn(
            CALLOUT_CLASSES,
            'AssetBrowser__syncSummary__callout--warning bg-warning-soft text-warning'
          )}
        >
          <IconAlertTriangle className="mt-px shrink-0" size={16} />
          <div>
            {summary.missing} asset{summary.missing === 1 ? ' is' : 's are'} no
            longer in the source. They were kept in this folder — delete them
            manually if they're unused.
          </div>
        </div>
      )}

      {failedCount > 0 && (
        <div
          className={cn(
            CALLOUT_CLASSES,
            'AssetBrowser__syncSummary__callout--error bg-danger-soft text-danger'
          )}
        >
          <IconCircleX className="mt-px shrink-0" size={16} />
          <div className="AssetBrowser__syncSummary__failed min-w-0 flex-1">
            <div className="AssetBrowser__syncSummary__failedTitle font-semibold">
              {failedCount} item{failedCount === 1 ? '' : 's'} failed to sync
            </div>
            <ul className="AssetBrowser__syncSummary__failedList m-0 mt-1.5 flex max-h-45 list-none flex-col gap-1.5 overflow-y-auto p-0">
              {visibleFailed.map((item, i) => (
                <li key={`${item.name}-${i}`}>
                  <div className="AssetBrowser__syncSummary__failedName text-sm font-medium wrap-anywhere">
                    {item.name}
                  </div>
                  <div className="AssetBrowser__syncSummary__failedError text-sm text-muted wrap-anywhere">
                    {item.error}
                  </div>
                </li>
              ))}
            </ul>
            {failedCount > FAILED_PREVIEW_COUNT && (
              <button
                type="button"
                className={LINK_BUTTON_CLASSES}
                onClick={() => setShowAllFailed(!showAllFailed)}
              >
                {showAllFailed
                  ? 'Show less'
                  : `Show all ${failedCount} failures`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
