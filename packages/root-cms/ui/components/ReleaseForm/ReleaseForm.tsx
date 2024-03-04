import {
  ActionIcon,
  Button,
  InputWrapper,
  LoadingOverlay,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {useEffect, useRef, useState} from 'preact/hooks';
import {route} from 'preact-router';
import {Release, addRelease, updateRelease} from '../../utils/release.js';
import {isSlugValid} from '../../utils/slug.js';
import {DocPreviewCard} from '../DocPreviewCard/DocPreviewCard.js';
import {useDocSelectModal} from '../DocSelectModal/DocSelectModal.js';
import './ReleaseForm.css';
import {IconArrowUpRight, IconTrash} from '@tabler/icons-preact';

export interface ReleaseFormProps {
  className?: string;
  releaseId?: string;
  buttonLabel?: string;
}

export function ReleaseForm(props: ReleaseFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!props.releaseId);
  const [release, setRelease] = useState<Release | null>(null);
  const [docIds, setDocIds] = useState<string[]>([]);
  const docSelectModal = useDocSelectModal();

  async function fetchRelease(releaseId: string) {
    console.log(releaseId);
  }

  useEffect(() => {
    if (!props.releaseId) {
      return;
    }
    setLoading(true);
    fetchRelease(props.releaseId);
  }, [props.releaseId]);

  async function onSubmit() {
    setError('');
    const form = formRef.current!;

    function getValue(name: string) {
      const inputEl = form.elements[name as any] as HTMLInputElement;
      if (inputEl) {
        return inputEl.value.trim();
      }
      return '';
    }

    const releaseId = props.releaseId || getValue('id');
    if (!releaseId) {
      setError('missing id');
      return;
    }
    if (!isSlugValid(releaseId)) {
      setError('id is invalid (alphanumeric characters and dashes only)');
      return;
    }

    const release: Release = {
      id: releaseId,
      description: getValue('description'),
      docIds: docIds,
    };

    try {
      setRelease(release);
      setSubmitting(true);
      if (props.releaseId) {
        await updateRelease(props.releaseId, release);
        showNotification({
          title: 'Saved release',
          message: `Successfully updated ${releaseId}`,
          autoClose: 5000,
        });
        setSubmitting(false);
      } else {
        await addRelease(releaseId, release);
        showNotification({
          title: 'Added release',
          message: `Successfully added ${releaseId}`,
          autoClose: 5000,
        });
        setSubmitting(false);
        route(`/cms/releases/${releaseId}`);
      }
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Failed to save release',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
      setSubmitting(false);
    }
  }

  function openDocSelectModal() {
    docSelectModal.open({
      selectedDocIds: docIds,
      onChange: (docId: string, selected: boolean) => {
        setDocIds((oldValue) => {
          const newValue = [...oldValue];
          if (selected) {
            newValue.push(docId);
          } else {
            const i = newValue.findIndex((id) => id === docId);
            if (i > -1) {
              newValue.splice(i, 1);
            }
          }
          console.log(newValue);
          return newValue.sort();
        });
      },
    });
  }

  return (
    <form
      className="ReleaseForm"
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <LoadingOverlay visible={loading} />
      <TextInput
        className="ReleaseForm__input"
        name="id"
        label="ID"
        description="Unique identifier for the release. Use alphanumeric characters and dashes only, e.g. grogus-favorite-meals"
        size="xs"
        radius={0}
        value={props.releaseId}
        disabled={!!props.releaseId}
      />
      <Textarea
        className="ReleaseForm__input"
        name="description"
        label="Description"
        description="Optional."
        size="xs"
        radius={0}
        value={release?.description}
      />
      <InputWrapper
        className="ReleaseForm__input"
        label="Docs"
        description="Select one or more docs to add to the release. Note: you can add or edit this list at a later time, if needed."
        size="xs"
      >
        {docIds.length > 0 && <ReleaseForm.DocPreviewCards docIds={docIds!} />}
        <Button
          className="ReleaseForm__docSelectButton"
          color="dark"
          size="xs"
          onClick={() => openDocSelectModal()}
        >
          {'Select'}
        </Button>
      </InputWrapper>
      <div className="ReleaseForm__submit__buttons">
        <Button
          className="ReleaseForm__submit"
          color="blue"
          size="xs"
          type="submit"
          loading={submitting}
        >
          {props.buttonLabel || 'Save'}
        </Button>
      </div>
      {error && <div className="ReleaseForm__error">Error: {error}</div>}
    </form>
  );
}

ReleaseForm.DocPreviewCards = (props: {docIds: string[]}) => {
  return (
    <div className="ReleaseForm__DocPreviewCards">
      {props.docIds.map((docId) => (
        <div key={docId} className="ReleaseForm__DocPreviewCards__card">
          <DocPreviewCard
            className="ReleaseForm__DocPreviewCards__card__preview"
            docId={docId}
          />
          <div className="ReleaseForm__DocPreviewCards__card__controls">
            <div className="ReleaseForm__DocPreviewCards__card__controls__remove">
              <Tooltip label="Remove">
                <ActionIcon
                  className="ReleaseForm__DocPreviewCards__card__controls__remove__icon"
                  // onClick={() => removeDoc()}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </div>
            <div className="ReleaseForm__DocPreviewCards__card__controls__open">
              <Tooltip label="Open">
                <ActionIcon<'a'>
                  component="a"
                  className="ReleaseForm__DocPreviewCards__card__controls__open__icon"
                  href={`/cms/content/${docId}`}
                  target="_blank"
                >
                  <IconArrowUpRight size={16} />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
