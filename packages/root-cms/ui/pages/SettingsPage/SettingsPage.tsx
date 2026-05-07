import './SettingsPage.css';
import {Button, LoadingOverlay, Switch, Textarea} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {doc, getDoc, setDoc, updateDoc} from 'firebase/firestore';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {UserRole} from '../../../core/client.js';
import {Heading} from '../../components/Heading/Heading.js';
import {PermissionGroupsBox} from '../../components/PermissionGroupsBox/PermissionGroupsBox.js';
import {ShareBox} from '../../components/ShareBox/ShareBox.js';
import {Surface} from '../../components/Surface/Surface.js';
import {Text} from '../../components/Text/Text.js';
import {useSearchIndexStatus} from '../../hooks/useGlobalSearch.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {SITE_SETTINGS, useSiteSettings} from '../../hooks/useSiteSettings.js';
import {useUserPreferences} from '../../hooks/useUserPreferences.js';
import {Layout} from '../../layout/Layout.js';
import {logAction} from '../../utils/actions.js';
import {notifyErrors} from '../../utils/notifications.js';
import {
  PermissionGroup,
  derivedRolesFromGroups,
} from '../../utils/permissionGroups.js';

function formatRelative(ts: number | null): string {
  if (!ts) {
    return 'never';
  }
  const ms = Date.now() - ts;
  if (ms < 60_000) {
    return 'just now';
  }
  if (ms < 60 * 60_000) {
    return `${Math.floor(ms / 60_000)} min ago`;
  }
  if (ms < 24 * 60 * 60_000) {
    return `${Math.floor(ms / (60 * 60_000))} hr ago`;
  }
  return new Date(ts).toLocaleString();
}

function isCurrentUserAdmin(roles: Record<string, string>): boolean {
  const email = window.firebase?.user?.email;
  if (!email) {
    return false;
  }
  if (roles[email] === 'ADMIN') {
    return true;
  }
  const domain = email.split('@').at(-1);
  if (domain && roles[`*@${domain}`] === 'ADMIN') {
    return true;
  }
  return false;
}

function SiteAdminSection() {
  const indexStatus = useSearchIndexStatus();
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [sawRunning, setSawRunning] = useState(false);
  const pollRef = useRef<number | null>(null);

  function stopPolling() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
    setSawRunning(false);
  }

  useEffect(() => {
    return stopPolling;
  }, []);

  // Track whether we've ever observed `running: true` since polling began.
  useEffect(() => {
    if (polling && indexStatus.running) {
      setSawRunning(true);
    }
  }, [polling, indexStatus.running]);

  async function rebuild(force: boolean) {
    if (submitting || polling) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/cms/api/search.rebuild', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({force}),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body || 'rebuild failed'}`);
      }
      showNotification({
        title: 'Search index',
        message: force
          ? 'Full rebuild started.'
          : 'Incremental rebuild started.',
        color: 'blue',
        autoClose: 4000,
      });
      setPolling(true);
      pollRef.current = window.setInterval(() => {
        indexStatus.refresh();
      }, 2000);
      // Watchdog: stop polling after 10 minutes.
      window.setTimeout(stopPolling, 10 * 60_000);
    } catch (err: any) {
      showNotification({
        title: 'Error',
        message: err?.message || String(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Stop polling + notify once the server reports !running, but only after
  // we've observed running:true at least once (avoids spurious "complete"
  // toasts on the initial poll cycle before the server-side flag flips).
  useEffect(() => {
    if (polling && sawRunning && !indexStatus.running) {
      stopPolling();
      showNotification({
        title: 'Search index',
        message: 'Rebuild complete.',
        color: 'green',
        autoClose: 3000,
      });
    }
  }, [polling, sawRunning, indexStatus.running]);

  const last = indexStatus.status.lastRun;
  const docCount = indexStatus.status.docCount;
  const fieldCount = indexStatus.status.fieldCount;
  const shardCount = indexStatus.status.shardCount;
  const running = indexStatus.running || submitting;

  return (
    <div className="SettingsPage__section">
      <div className="SettingsPage__section__left">
        <Heading className="SettingsPage__section__left__title">
          Site Admin
        </Heading>
        <Text
          className="SettingsPage__section__body"
          size="body-sm"
          weight="semi-bold"
          color="gray"
        >
          <p>
            Project-wide administrative actions. Only admins see this section.
          </p>
        </Text>
      </div>
      <Surface className="SettingsPage__section__right">
        <div className="SettingsPage__section__setting">
          <Text size="body" weight="semi-bold">
            Search index
          </Text>
          <Text size="body-sm" weight="semi-bold" color="gray">
            <p>
              Powers the Cmd+K global search. Rebuilds run automatically on a
              schedule; trigger a manual rebuild here if you want immediate
              results (e.g. after a schema change).
            </p>
          </Text>
          <div className="SettingsPage__siteAdmin__searchStats">
            <div>
              <strong>Last indexed:</strong> {formatRelative(last)}
            </div>
            <div>
              <strong>Indexed docs:</strong> {docCount.toLocaleString()}
            </div>
            <div>
              <strong>Indexed fields:</strong> {fieldCount.toLocaleString()}
            </div>
            <div>
              <strong>Shards:</strong> {shardCount}
            </div>
          </div>
          <div className="SettingsPage__siteAdmin__searchButtons">
            <Button
              variant="default"
              size="xs"
              compact
              loading={running}
              onClick={() => rebuild(false)}
            >
              Rebuild incremental
            </Button>
            <Button
              variant="default"
              size="xs"
              compact
              loading={running}
              onClick={() => {
                if (
                  window.confirm(
                    'Force a full rebuild? This wipes the existing index and ' +
                      'reindexes every doc from scratch.'
                  )
                ) {
                  rebuild(true);
                }
              }}
            >
              Force full rebuild
            </Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}

interface ShareDoc {
  roles: Record<string, UserRole>;
  permissionGroups: PermissionGroup[];
}

function shareDocsEqual(a: ShareDoc, b: ShareDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ShareSection() {
  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
  const collections = window.__ROOT_CTX.collections || {};
  const collectionIds = useMemo(
    () => Object.keys(collections).sort(),
    [collections]
  );
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Snapshot of the saved/server state. Used to compute the dirty flag and to
  // diff per-collection role writes on save.
  const [savedState, setSavedState] = useState<ShareDoc>({
    roles: {},
    permissionGroups: [],
  });
  const [draft, setDraft] = useState<ShareDoc>({
    roles: {},
    permissionGroups: [],
  });

  useEffect(() => {
    getDoc(docRef).then((snapshot) => {
      const data = snapshot.data() || {};
      const initial: ShareDoc = {
        roles: (data.roles || {}) as Record<string, UserRole>,
        permissionGroups: (data.permissionGroups || []) as PermissionGroup[],
      };
      setSavedState(initial);
      setDraft({
        roles: {...initial.roles},
        permissionGroups: initial.permissionGroups.map((g) => ({...g})),
      });
      setLoading(false);
    });
  }, []);

  const currentUserIsAdmin = isCurrentUserAdmin(savedState.roles);
  const dirty = !shareDocsEqual(savedState, draft);

  function setRoles(roles: Record<string, UserRole>) {
    setDraft((prev) => ({...prev, roles}));
  }

  function setGroups(permissionGroups: PermissionGroup[]) {
    setDraft((prev) => ({...prev, permissionGroups}));
  }

  function discard() {
    setDraft({
      roles: {...savedState.roles},
      permissionGroups: savedState.permissionGroups.map((g) => ({...g})),
    });
  }

  async function save() {
    if (saving || !dirty) {
      return;
    }
    setSaving(true);
    await notifyErrors(async () => {
      // Derive the effective project + per-collection roles by merging the
      // direct ShareBox entries with the permission groups.
      const {projectRoles: derivedProjectRoles, collectionRoles} =
        derivedRolesFromGroups(draft.permissionGroups, draft.roles);

      await updateDoc(docRef, {
        roles: derivedProjectRoles,
        permissionGroups: draft.permissionGroups,
      });

      // Compute the union of touched collection ids (newly assigned + any
      // previously assigned that may need clearing) so groups removed from
      // collections also clear their role entries.
      const previousCollectionGroups = savedState.permissionGroups.flatMap(
        (g) => g.collections || []
      );
      const touchedCollections = new Set<string>([
        ...Object.keys(collectionRoles),
        ...previousCollectionGroups,
      ]);
      for (const collectionId of touchedCollections) {
        const collectionDocRef = doc(
          db,
          'Projects',
          projectId,
          'Collections',
          collectionId
        );
        await setDoc(
          collectionDocRef,
          {roles: collectionRoles[collectionId] || {}},
          {merge: true}
        );
      }

      const nextSavedState: ShareDoc = {
        roles: derivedProjectRoles,
        permissionGroups: draft.permissionGroups,
      };
      setSavedState(nextSavedState);
      setDraft({
        roles: {...nextSavedState.roles},
        permissionGroups: nextSavedState.permissionGroups.map((g) => ({...g})),
      });
      logAction('acls.save_groups', {
        metadata: {
          groupCount: draft.permissionGroups.length,
          userCount: Object.keys(derivedProjectRoles).length,
          collections: Array.from(touchedCollections),
        },
      });
      showNotification({
        title: 'Saved',
        message: 'Sharing settings updated.',
        color: 'green',
        autoClose: 3000,
      });
    });
    setSaving(false);
  }

  return (
    <div className="SettingsPage__section SettingsPage__section__users">
      <div className="SettingsPage__section__left">
        <Heading className="SettingsPage__section__left__title">Share</Heading>
        <Text
          className="SettingsPage__section__body"
          size="body-sm"
          weight="semi-bold"
          color="gray"
        >
          <p>
            Share access to the CMS. To share with everyone in a domain, use
            *@example.com.
          </p>
          <ul>
            <li>VIEWER: view docs but not edit</li>
            <li>CONTRIBUTOR: view and edit docs, but not publish</li>
            <li>EDITOR: view, edit, and publish docs</li>
            <li>ADMIN: all of the above and change sharing settings</li>
          </ul>
          <p>
            Use <strong>groups</strong> to manage many users at once and
            optionally scope a role to specific collections.
          </p>
        </Text>
      </div>
      <Surface className="SettingsPage__section__right">
        <div className="SettingsPage__share">
          <LoadingOverlay
            visible={loading}
            loaderProps={{color: 'gray', size: 'xl'}}
          />
          <div className="SettingsPage__share__subsection">
            <Heading className="SettingsPage__section__right__title" size="h3">
              Users
            </Heading>
            <ShareBox
              className="SettingsPage__section__users__sharebox"
              roles={draft.roles}
              onChange={setRoles}
              currentUserIsAdmin={currentUserIsAdmin}
            />
          </div>
          <div className="SettingsPage__share__subsection">
            <Heading className="SettingsPage__section__right__title" size="h3">
              Groups
            </Heading>
            <Text></Text>
            <PermissionGroupsBox
              groups={draft.permissionGroups}
              onChange={setGroups}
              collections={collectionIds}
              disabled={!currentUserIsAdmin}
            />
          </div>
          <div className="SettingsPage__share__saveBar">
            <Text size="body-sm" weight="semi-bold" color="gray">
              {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
            </Text>
            <div className="SettingsPage__share__saveBar__actions">
              <Button
                variant="default"
                size="xs"
                radius={0}
                disabled={!dirty || saving}
                onClick={discard}
              >
                Discard
              </Button>
              <Button
                size="xs"
                radius={0}
                color="dark"
                loading={saving}
                disabled={!dirty || !currentUserIsAdmin}
                onClick={save}
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}

export function SettingsPage() {
  usePageTitle('Settings');
  const userPrefs = useUserPreferences();
  const siteSettings = useSiteSettings();
  const projectRoles = useProjectRoles();
  const isAdmin =
    !projectRoles.loading && isCurrentUserAdmin(projectRoles.roles);
  return (
    <Layout>
      <div className="SettingsPage">
        <ShareSection />
        <div className="SettingsPage__section">
          <div className="SettingsPage__section__left">
            <Heading className="SettingsPage__section__left__title">
              Site Settings
            </Heading>
            <Text
              className="SettingsPage__section__body"
              size="body-sm"
              weight="semi-bold"
              color="gray"
            >
              <p>
                These settings apply to the project. Only admins can change
                them.
              </p>
            </Text>
          </div>
          <Surface className="SettingsPage__section__right">
            {SITE_SETTINGS.map((setting) => (
              <div className="SettingsPage__section__setting" key={setting.key}>
                <Text size="body" weight="semi-bold">
                  {setting.name}
                </Text>
                <Text size="body-sm" weight="semi-bold" color="gray">
                  <p>{setting.description}</p>
                </Text>
                <Textarea
                  autosize
                  minRows={2}
                  maxRows={4}
                  value={siteSettings.settings[setting.key] || ''}
                  placeholder={setting.placeholder}
                  onChange={(e: Event) =>
                    siteSettings.setSettings(
                      setting.key,
                      (e.currentTarget as HTMLTextAreaElement).value
                    )
                  }
                />
                {setting.ui && (
                  <div>{setting.ui(siteSettings.settings[setting.key])}</div>
                )}
              </div>
            ))}
          </Surface>
        </div>
        {isAdmin && <SiteAdminSection />}
        <div className="SettingsPage__section">
          <div className="SettingsPage__section__left">
            <Heading className="SettingsPage__section__left__title">
              User Preferences
            </Heading>
            <Text
              className="SettingsPage__section__body"
              size="body-sm"
              weight="semi-bold"
              color="gray"
            >
              <p>These settings are for you only.</p>
            </Text>
          </div>
          <Surface className="SettingsPage__section__right">
            <div className="SettingsPage__section__userPref">
              <div className="SettingsPage__section__userPref__description">
                <Text
                  className="SettingsPage__section__userPref__description__title"
                  size="body"
                  weight="semi-bold"
                >
                  Enable EditorJS Editor (legacy)
                </Text>
                <Text
                  className="SettingsPage__section__userPref__description__body"
                  size="body-sm"
                  weight="semi-bold"
                  color="gray"
                >
                  <p>
                    Replaces the{' '}
                    <a
                      href="https://lexical.dev/"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      Lexical
                    </a>{' '}
                    (default) rich text editor with the{' '}
                    <a
                      href="https://editorjs.io/"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      EditorJS
                    </a>{' '}
                    (legacy) version.
                  </p>
                </Text>
              </div>
              <div className="SettingsPage__section__userPref__input">
                <Switch
                  color="dark"
                  checked={userPrefs.preferences.EnableEditorJSEditor}
                  onChange={(e: Event) => {
                    const enabled = (e.currentTarget as HTMLInputElement)
                      .checked;
                    userPrefs.setPreference('EnableEditorJSEditor', enabled);
                  }}
                />
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </Layout>
  );
}
