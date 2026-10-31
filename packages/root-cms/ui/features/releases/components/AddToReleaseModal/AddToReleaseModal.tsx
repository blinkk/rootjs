import {useEffect, useState} from 'preact/hooks';
import {isSlugValid} from '../../../../../shared/slug.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {DocPreviewCard} from '../../../collections/components/DocPreviewCard/DocPreviewCard.js';
import {
  Release,
  addRelease,
  generateReleaseId,
  isPendingRelease,
  listReleases,
  updateRelease,
} from '../../release.js';
import {ADD_TO_RELEASE_MODAL_ID} from './useAddToReleaseModal.js';

type Mode = 'new' | 'existing' | '';

export interface AddToReleaseModalProps {
  [key: string]: unknown;
  /** Doc IDs to add to the release. */
  docIds: string[];
}

/**
 * Lists the pending releases and adds docs to a new or existing release.
 * Shared by `AddToReleaseModal` and the publish modal's "Add to release" tab.
 */
export function useAddToRelease(options?: {
  /** Whether to load the releases. Defaults to true. */
  enabled?: boolean;
}) {
  const enabled = options?.enabled ?? true;
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);

  useEffect(() => {
    if (!enabled || loaded) {
      return;
    }
    async function fetchReleases() {
      setLoading(true);
      await notifyErrors(async () => {
        const allReleases = await listReleases();
        // Filter to unpublished, non-archived releases.
        setReleases(allReleases.filter(isPendingRelease));
      });
      setLoading(false);
      setLoaded(true);
    }
    fetchReleases();
  }, [enabled]);

  /** Creates a new release with the docs. Resolves to true on success. */
  async function createRelease(
    releaseId: string,
    docIds: string[],
    description?: string
  ): Promise<boolean> {
    if (!releaseId) {
      showNotification({
        title: 'Missing ID',
        message: 'Please enter a release ID.',
        color: 'red',
        autoClose: 5000,
      });
      return false;
    }
    if (!isSlugValid(releaseId)) {
      showNotification({
        title: 'Invalid ID',
        message: 'Release ID must use alphanumeric characters and dashes only.',
        color: 'red',
        autoClose: 5000,
      });
      return false;
    }

    let success = false;
    setSubmitting(true);
    await notifyErrors(async () => {
      const release: Partial<Release> = {docIds: docIds};
      if (description) {
        release.description = description;
      }
      await addRelease(releaseId, release);
      showNotification({
        title: `Release created: ${releaseId}`,
        message: (
          <div>
            <div>Created release with {docIds.length} doc(s).</div>
            <Button
              className="AddToReleaseModal__notificationButton mt-2"
              href={`/cms/releases/${releaseId}`}
              size="xs"
            >
              View release
            </Button>
          </div>
        ),
        autoClose: 10000,
      });
      success = true;
    });
    setSubmitting(false);
    return success;
  }

  /** Adds the docs to an existing release. Resolves to true on success. */
  async function addToRelease(
    releaseId: string,
    docIds: string[]
  ): Promise<boolean> {
    if (!releaseId) {
      showNotification({
        title: 'No release selected',
        message: 'Please select a release.',
        color: 'red',
        autoClose: 5000,
      });
      return false;
    }

    let success = false;
    setSubmitting(true);
    await notifyErrors(async () => {
      const release = releases.find((r) => r.id === releaseId);
      const existingDocIds = release?.docIds || [];
      // Merge doc IDs, avoiding duplicates.
      const mergedDocIds = Array.from(
        new Set([...existingDocIds, ...docIds])
      ).sort();
      await updateRelease(releaseId, {docIds: mergedDocIds});
      const addedCount = mergedDocIds.length - existingDocIds.length;
      showNotification({
        title: `Docs added to release: ${releaseId}`,
        message: (
          <div>
            <div>Added {addedCount} new doc(s) to release.</div>
            <Button
              className="AddToReleaseModal__notificationButton mt-2"
              href={`/cms/releases/${releaseId}`}
              size="xs"
            >
              View release
            </Button>
          </div>
        ),
        autoClose: 10000,
      });
      success = true;
    });
    setSubmitting(false);
    return success;
  }

  return {releases, loading, loaded, submitting, createRelease, addToRelease};
}

export function AddToReleaseModal(
  modalProps: ContextModalProps<AddToReleaseModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const modals = useModals();
  const [mode, setMode] = useState<Mode>('');
  const [selectedReleaseId, setSelectedReleaseId] = useState('');
  const [newReleaseId, setNewReleaseId] = useState(generateReleaseId());
  const [newReleaseDescription, setNewReleaseDescription] = useState('');
  const {releases, loading, submitting, createRelease, addToRelease} =
    useAddToRelease();

  async function onSubmit() {
    let success = false;
    if (mode === 'new') {
      success = await createRelease(
        newReleaseId,
        props.docIds,
        newReleaseDescription
      );
    } else if (mode === 'existing') {
      success = await addToRelease(selectedReleaseId, props.docIds);
    }
    if (success) {
      modals.closeAll();
    }
  }

  let disabled = true;
  if (mode === 'new' && newReleaseId) {
    disabled = false;
  } else if (mode === 'existing' && selectedReleaseId) {
    disabled = false;
  }

  return (
    <div className="AddToReleaseModal text-sm leading-normal text-fg">
      <div className="AddToReleaseModal__docs mb-4">
        <div className="AddToReleaseModal__docsLabel mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Docs to add ({props.docIds.length})
        </div>
        <div className="AddToReleaseModal__docsList flex flex-col divide-y divide-border">
          {props.docIds.map((docId) => (
            <DocPreviewCard
              key={docId}
              className="px-3"
              docId={docId}
              variant="compact"
              statusBadges
            />
          ))}
        </div>
      </div>

      <div
        className="AddToReleaseModal__mode mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Release"
      >
        <ModeOption
          value="new"
          mode={mode}
          onSelect={setMode}
          label="New release"
          help="Create a new release with these docs."
        />
        <ModeOption
          value="existing"
          mode={mode}
          onSelect={setMode}
          label="Existing release"
          help="Add to an existing release."
        />
      </div>

      {mode === 'new' && (
        <div className="AddToReleaseModal__form mt-3 flex flex-col gap-3">
          <TextInput
            className="AddToReleaseModal__releaseId"
            label="Release ID"
            placeholder="e.g. my-release"
            value={newReleaseId}
            onInput={(e: Event) => {
              setNewReleaseId((e.target as HTMLInputElement).value);
            }}
          />
          <Textarea
            className="AddToReleaseModal__description"
            label="Description (optional)"
            minRows={2}
            placeholder="Describe this release"
            value={newReleaseDescription}
            onInput={(e: Event) => {
              setNewReleaseDescription((e.target as HTMLTextAreaElement).value);
            }}
          />
        </div>
      )}

      {mode === 'existing' && (
        <div className="AddToReleaseModal__releases mt-3 flex max-h-50 flex-col gap-1.5 overflow-y-auto">
          {loading ? (
            <div className="AddToReleaseModal__releasesEmpty flex justify-center p-4 text-muted">
              <Spinner size="sm" />
            </div>
          ) : releases.length === 0 ? (
            <div className="AddToReleaseModal__releasesEmpty p-4 text-center text-xs text-muted">
              No unpublished releases found. Create a new one instead.
            </div>
          ) : (
            releases.map((release) => (
              <label
                key={release.id}
                className={cn(
                  'AddToReleaseModal__release',
                  selectedReleaseId === release.id &&
                    'AddToReleaseModal__release--selected',
                  'flex cursor-pointer items-center gap-2 rounded-sm border border-solid px-3 py-2 transition-colors hover:border-focus',
                  selectedReleaseId === release.id
                    ? 'border-focus bg-info-soft'
                    : 'border-border'
                )}
              >
                <input
                  className="m-0 shrink-0 accent-primary"
                  type="radio"
                  name="existing-release"
                  checked={selectedReleaseId === release.id}
                  onChange={() => setSelectedReleaseId(release.id)}
                />
                <div className="AddToReleaseModal__releaseInfo min-w-0 flex-1">
                  <div className="AddToReleaseModal__releaseId truncate text-sm font-semibold">
                    {release.id}
                  </div>
                  {release.description && (
                    <div className="AddToReleaseModal__releaseDescription truncate text-xs text-muted">
                      {release.description}
                    </div>
                  )}
                </div>
                <div className="AddToReleaseModal__releaseDocCount whitespace-nowrap text-xs text-muted">
                  {release.docIds?.length || 0} doc(s)
                </div>
              </label>
            ))
          )}
        </div>
      )}

      <div className="AddToReleaseModal__buttons mt-5 flex justify-end gap-3">
        <Button onClick={() => context.closeModal(id)}>Cancel</Button>
        <Button
          variant="primary"
          disabled={disabled}
          loading={submitting}
          onClick={onSubmit}
        >
          {mode === 'new' ? 'Create release' : 'Add to release'}
        </Button>
      </div>
    </div>
  );
}

/** One of the "new release" / "existing release" choices. */
function ModeOption(props: {
  value: Exclude<Mode, ''>;
  mode: Mode;
  onSelect: (mode: Mode) => void;
  label: string;
  help: string;
}) {
  const selected = props.mode === props.value;
  // Once a choice is made, the other one fades.
  const unselected = Boolean(props.mode) && !selected;
  return (
    <label
      className={cn(
        'AddToReleaseModal__option',
        selected && 'AddToReleaseModal__option--selected',
        unselected && 'AddToReleaseModal__option--unselected',
        'block cursor-pointer rounded-sm border border-solid px-3 py-4 transition-all duration-300',
        selected ? 'border-focus' : 'border-border',
        unselected && 'opacity-40 hover:opacity-60'
      )}
    >
      <div className="AddToReleaseModal__optionInput flex items-center gap-1 font-medium">
        <input
          className="m-0 mr-1 accent-primary"
          type="radio"
          name="release-mode"
          value={props.value}
          checked={selected}
          onChange={() => props.onSelect(props.value)}
        />
        {props.label}
      </div>
      <div className="AddToReleaseModal__optionHelp mt-1 pl-5 text-xs">
        {props.help}
      </div>
    </label>
  );
}

AddToReleaseModal.id = ADD_TO_RELEASE_MODAL_ID;
