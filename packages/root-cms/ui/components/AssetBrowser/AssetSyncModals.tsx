import {Button, Loader, Modal, TextInput, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconBrandFigma,
  IconCloudDownload,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {syncFolder} from '../../utils/asset-sync/engine.js';
import {
  getSyncProvider,
  parseSyncSourceUrl,
} from '../../utils/asset-sync/registry.js';
import {
  getProviderToken,
  setProviderToken,
} from '../../utils/asset-sync/tokens.js';
import {
  AssetSyncProvider,
  SyncInProgressError,
  SyncProgress,
  SyncSummary,
  SyncTokenRequiredError,
} from '../../utils/asset-sync/types.js';
import {
  AssetFolder,
  connectFolderSync,
  disconnectFolderSync,
  joinFolderPath,
} from '../../utils/assets.js';

/** Renders the icon for a sync provider. */
export function SyncProviderIcon(props: {provider?: string; size?: number}) {
  const size = props.size ?? 14;
  if (props.provider === 'figma') {
    return <IconBrandFigma size={size} />;
  }
  return <IconCloudDownload size={size} />;
}

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
  const hasStoredToken = provider ? !!getProviderToken(provider.id) : false;
  const showTokenSection = !!provider && (!hasStoredToken || showTokenInput);
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
    <Modal
      opened
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
        className="AssetBrowser__syncModal"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="AssetBrowser__syncModal__text">
          Sync the exportable assets of a Figma file or node into this folder.
          Assets marked for export in Figma are imported here and can be
          re-synced when the designs change.
        </div>
        <TextInput
          data-autofocus
          label="Source URL"
          placeholder="https://www.figma.com/design/..."
          description={
            provider
              ? `Source: ${provider.label}`
              : 'Link to a Figma file, or a specific node ("Copy link to selection" in Figma).'
          }
          value={url}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setUrl(e.currentTarget.value)
          }
        />
        {showTokenSection && provider && (
          <div className="AssetBrowser__syncModal__token">
            <TextInput
              label={`${provider.label} access token`}
              placeholder="Personal access token"
              type="password"
              value={tokenInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setTokenInput(e.currentTarget.value)
              }
            />
            {provider.tokenHelp && (
              <div className="AssetBrowser__syncModal__tokenHelp">
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
          <div className="AssetBrowser__syncModal__tokenSaved">
            Using the {provider.label} token saved in this browser.{' '}
            <button
              type="button"
              className="AssetBrowser__syncModal__linkButton"
              onClick={() => setShowTokenInput(true)}
            >
              Change token
            </button>
          </div>
        )}
        {error && <div className="AssetBrowser__syncModal__error">{error}</div>}
        <div className="AssetBrowser__syncModal__buttons">
          {existingSync && (
            <Button
              type="button"
              variant="outline"
              color="red"
              loading={disconnecting}
              disabled={submitting}
              onClick={() => onDisconnect()}
            >
              Disconnect
            </Button>
          )}
          <Button
            type="submit"
            color="dark"
            loading={submitting}
            disabled={disconnecting}
          >
            {existingSync ? 'Save & sync now' : 'Connect & sync now'}
          </Button>
        </div>
      </form>
    </Modal>
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

  const running = status === 'running';

  return (
    <Modal
      opened
      onClose={props.onClose}
      closeOnClickOutside={!running}
      closeOnEscape={!running}
      withCloseButton={!running}
      title={`Syncing "${folder.name}"`}
      size="md"
      centered
    >
      <div className="AssetBrowser__syncProgress">
        {status === 'running' && (
          <div className="AssetBrowser__syncProgress__running">
            <Loader color="gray" size="sm" />
            <div className="AssetBrowser__syncProgress__phase">
              {progress.phase === 'enumerating' && 'Finding exportable assets…'}
              {progress.phase === 'downloading' &&
                (progress.total
                  ? `Importing ${Math.min(
                      (progress.completed ?? 0) + 1,
                      progress.total
                    )} of ${progress.total}${
                      progress.currentName ? ` — ${progress.currentName}` : ''
                    }`
                  : 'Importing…')}
              {progress.phase === 'finalizing' && 'Finishing up…'}
            </div>
          </div>
        )}

        {status === 'token' && provider && (
          <div className="AssetBrowser__syncProgress__token">
            <div className="AssetBrowser__syncModal__text">
              A {provider.label} access token is needed to sync. Your token is
              stored only in this browser and is used to verify you have access
              to the source.
            </div>
            <TextInput
              data-autofocus
              label={`${provider.label} access token`}
              placeholder="Personal access token"
              type="password"
              value={tokenInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setTokenInput(e.currentTarget.value)
              }
            />
            {provider.tokenHelp && (
              <div className="AssetBrowser__syncModal__tokenHelp">
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
            {error && (
              <div className="AssetBrowser__syncModal__error">{error}</div>
            )}
            <div className="AssetBrowser__syncModal__buttons">
              <Button variant="default" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                color="dark"
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
          <div className="AssetBrowser__syncProgress__conflict">
            <div className="AssetBrowser__syncModal__text">
              A sync started by <b>{conflict.startedBy}</b> appears to be in
              progress. Running two syncs at once is usually harmless but may
              duplicate work.
            </div>
            <div className="AssetBrowser__syncModal__buttons">
              <Button variant="default" onClick={props.onClose}>
                Cancel
              </Button>
              <Button color="dark" onClick={() => run({force: true})}>
                Sync anyway
              </Button>
            </div>
          </div>
        )}

        {status === 'done' && summary && (
          <div className="AssetBrowser__syncProgress__done">
            {summary.upToDate ? (
              <div className="AssetBrowser__syncModal__text">
                Everything is up to date — the source hasn't changed since the
                last sync ({summary.unchanged} asset(s) unchanged).
              </div>
            ) : (
              <ul className="AssetBrowser__syncProgress__counts">
                <li>{summary.added} added</li>
                <li>
                  {summary.updated} updated
                  {summary.updatedDocIds.length > 0 && (
                    <>
                      {' '}
                      (refreshed in {new Set(summary.updatedDocIds).size}{' '}
                      doc(s))
                    </>
                  )}
                </li>
                <li>{summary.unchanged} unchanged</li>
                {summary.missing > 0 && (
                  <li>
                    <IconAlertTriangle size={14} /> {summary.missing} no longer
                    in the source (kept in the folder; delete manually if
                    unused)
                  </li>
                )}
              </ul>
            )}
            {summary.failed.length > 0 && (
              <div className="AssetBrowser__syncProgress__failed">
                <div className="AssetBrowser__syncModal__error">
                  {summary.failed.length} item(s) failed to sync. Syncing again
                  will retry them.
                </div>
                <ul>
                  {summary.failed.slice(0, 10).map((item) => (
                    <li key={item.name}>
                      <Tooltip label={item.error} withArrow>
                        <span>
                          {item.name}: {item.error}
                        </span>
                      </Tooltip>
                    </li>
                  ))}
                  {summary.failed.length > 10 && (
                    <li>…and {summary.failed.length - 10} more</li>
                  )}
                </ul>
              </div>
            )}
            <div className="AssetBrowser__syncModal__buttons">
              <Button color="dark" onClick={props.onClose}>
                Done
              </Button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="AssetBrowser__syncProgress__error">
            <div className="AssetBrowser__syncModal__error">{error}</div>
            <div className="AssetBrowser__syncModal__buttons">
              <Button variant="default" onClick={props.onClose}>
                Close
              </Button>
              <Button color="dark" onClick={() => run()}>
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
