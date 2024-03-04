import {
  Button,
  InputWrapper,
  LoadingOverlay,
  TextInput,
  Textarea,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {useEffect, useRef, useState} from 'preact/hooks';
import {route} from 'preact-router';
import {Release, addRelease, updateRelease} from '../../utils/release.js';
import {isSlugValid} from '../../utils/slug.js';
import './ReleaseForm.css';

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

    const url = getValue('url');
    if (!url) {
      setError('missing url');
      return;
    }

    const release: Release = {
      id: releaseId,
      description: getValue('description'),
      // docIds: docIds,
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
      setSubmitting(false);
    }
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
      ></InputWrapper>
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
