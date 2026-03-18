import './AddToReleaseModal.css';

import {Button, Loader} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {useEffect, useState} from 'preact/hooks';
import {isSlugValid} from '../../../shared/slug.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {notifyErrors} from '../../utils/notifications.js';
import {
  Release,
  addRelease,
  generateReleaseId,
  listReleases,
  updateRelease,
} from '../../utils/release.js';
import {DocPreviewCard} from '../DocPreviewCard/DocPreviewCard.js';

const MODAL_ID = 'AddToReleaseModal';

type Mode = 'new' | 'existing' | '';

export interface AddToReleaseModalProps {
  [key: string]: unknown;
  /** Doc IDs to add to the release. */
  docIds: string[];
}

export function useAddToReleaseModal(props: AddToReleaseModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: 'Add docs to a release',
        innerProps: props,
        size: '600px',
      });
    },
  };
}

export function AddToReleaseModal(
  modalProps: ContextModalProps<AddToReleaseModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const modals = useModals();
  const [mode, setMode] = useState<Mode>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState('');
  const [newReleaseId, setNewReleaseId] = useState(generateReleaseId());
  const [newReleaseDescription, setNewReleaseDescription] = useState('');

  useEffect(() => {
    async function fetchReleases() {
      setLoading(true);
      await notifyErrors(async () => {
        const allReleases = await listReleases();
        // Filter to unpublished, non-archived releases.
        const unpublished = allReleases.filter(
          (r) => !r.publishedAt && !r.archivedAt
        );
        setReleases(unpublished);
      });
      setLoading(false);
    }
    fetchReleases();
  }, []);

  async function onSubmit() {
    if (mode === 'new') {
      await createNewRelease();
    } else if (mode === 'existing') {
      await addToExistingRelease();
    }
  }

  async function createNewRelease() {
    if (!newReleaseId) {
      showNotification({
        title: 'Missing ID',
        message: 'Please enter a release ID.',
        color: 'red',
        autoClose: 5000,
      });
      return;
    }
    if (!isSlugValid(newReleaseId)) {
      showNotification({
        title: 'Invalid ID',
        message: 'Release ID must use alphanumeric characters and dashes only.',
        color: 'red',
        autoClose: 5000,
      });
      return;
    }

    setSubmitting(true);
    await notifyErrors(async () => {
      await addRelease(newReleaseId, {
        description: newReleaseDescription || undefined,
        docIds: props.docIds,
      });
      showNotification({
        title: 'Release created',
        message: `Created release "${newReleaseId}" with ${props.docIds.length} doc(s).`,
        autoClose: 10000,
      });
      modals.closeAll();
    });
    setSubmitting(false);
  }

  async function addToExistingRelease() {
    if (!selectedReleaseId) {
      showNotification({
        title: 'No release selected',
        message: 'Please select a release.',
        color: 'red',
        autoClose: 5000,
      });
      return;
    }

    setSubmitting(true);
    await notifyErrors(async () => {
      const release = releases.find((r) => r.id === selectedReleaseId);
      const existingDocIds = release?.docIds || [];
      // Merge doc IDs, avoiding duplicates.
      const mergedDocIds = Array.from(
        new Set([...existingDocIds, ...props.docIds])
      ).sort();
      await updateRelease(selectedReleaseId, {docIds: mergedDocIds});
      const addedCount = mergedDocIds.length - existingDocIds.length;
      showNotification({
        title: 'Docs added to release',
        message: `Added ${addedCount} new doc(s) to release "${selectedReleaseId}".`,
        autoClose: 10000,
      });
      modals.closeAll();
    });
    setSubmitting(false);
  }

  let disabled = true;
  if (mode === 'new' && newReleaseId) {
    disabled = false;
  } else if (mode === 'existing' && selectedReleaseId) {
    disabled = false;
  }

  return (
    <div className="AddToReleaseModal">
      <div className="AddToReleaseModal__content">
        <div className="AddToReleaseModal__docs">
          <div className="AddToReleaseModal__docs__label">
            Docs to add ({props.docIds.length})
          </div>
          <div className="AddToReleaseModal__docs__list">
            {props.docIds.map((docId) => (
              <DocPreviewCard
                key={docId}
                docId={docId}
                variant="compact"
                statusBadges
              />
            ))}
          </div>
        </div>

        <div className="AddToReleaseModal__mode">
          <label
            className={`AddToReleaseModal__mode__option${
              mode === 'new'
                ? ' AddToReleaseModal__mode__option--selected'
                : mode
                ? ' AddToReleaseModal__mode__option--unselected'
                : ''
            }`}
          >
            <div className="AddToReleaseModal__mode__option__input">
              <input
                type="radio"
                name="release-mode"
                value="new"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />{' '}
              New release
            </div>
            <div className="AddToReleaseModal__mode__option__help">
              Create a new release with these docs.
            </div>
          </label>
          <label
            className={`AddToReleaseModal__mode__option${
              mode === 'existing'
                ? ' AddToReleaseModal__mode__option--selected'
                : mode
                ? ' AddToReleaseModal__mode__option--unselected'
                : ''
            }`}
          >
            <div className="AddToReleaseModal__mode__option__input">
              <input
                type="radio"
                name="release-mode"
                value="existing"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
              />{' '}
              Existing release
            </div>
            <div className="AddToReleaseModal__mode__option__help">
              Add to an existing release.
            </div>
          </label>
        </div>

        {mode === 'new' && (
          <div className="AddToReleaseModal__form">
            <div className="AddToReleaseModal__form__field">
              <label>Release ID</label>
              <input
                type="text"
                placeholder="e.g. my-release"
                value={newReleaseId}
                onInput={(e: Event) => {
                  setNewReleaseId((e.target as HTMLInputElement).value);
                }}
              />
            </div>
            <div className="AddToReleaseModal__form__field">
              <label>Description (optional)</label>
              <textarea
                rows={2}
                placeholder="Describe this release"
                value={newReleaseDescription}
                onInput={(e: Event) => {
                  setNewReleaseDescription(
                    (e.target as HTMLTextAreaElement).value
                  );
                }}
              />
            </div>
          </div>
        )}

        {mode === 'existing' && (
          <div className="AddToReleaseModal__releases">
            {loading ? (
              <div className="AddToReleaseModal__releases__empty">
                <Loader color="gray" size="sm" />
              </div>
            ) : releases.length === 0 ? (
              <div className="AddToReleaseModal__releases__empty">
                No unpublished releases found. Create a new one instead.
              </div>
            ) : (
              releases.map((release) => (
                <div
                  key={release.id}
                  className={`AddToReleaseModal__release${
                    selectedReleaseId === release.id
                      ? ' AddToReleaseModal__release--selected'
                      : ''
                  }`}
                  onClick={() => setSelectedReleaseId(release.id)}
                >
                  <input
                    type="radio"
                    name="existing-release"
                    checked={selectedReleaseId === release.id}
                    onChange={() => setSelectedReleaseId(release.id)}
                  />
                  <div className="AddToReleaseModal__release__info">
                    <div className="AddToReleaseModal__release__info__id">
                      {release.id}
                    </div>
                    {release.description && (
                      <div className="AddToReleaseModal__release__info__description">
                        {release.description}
                      </div>
                    )}
                  </div>
                  <div className="AddToReleaseModal__release__docCount">
                    {release.docIds?.length || 0} doc(s)
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="AddToReleaseModal__buttons">
          <Button
            variant="outline"
            onClick={() => context.closeModal(id)}
            type="button"
            size="xs"
            color="dark"
          >
            Cancel
          </Button>
          <Button
            variant="filled"
            size="xs"
            color="dark"
            disabled={disabled}
            loading={submitting}
            onClick={onSubmit}
          >
            {mode === 'new' ? 'Create release' : 'Add to release'}
          </Button>
        </div>
      </div>
    </div>
  );
}

AddToReleaseModal.id = MODAL_ID;
