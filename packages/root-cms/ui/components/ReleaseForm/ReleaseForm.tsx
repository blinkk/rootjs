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
import {IconArrowUpRight, IconTrash} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {route} from 'preact-router';
import {isSlugValid} from '../../../shared/slug.js';
import {notifyErrors} from '../../utils/notifications.js';
import {
  Release,
  addRelease,
  getRelease,
  updateRelease,
} from '../../utils/release.js';
import {DocPreviewCard} from '../DocPreviewCard/DocPreviewCard.js';
import {useDocSelectModal} from '../DocSelectModal/DocSelectModal.js';
import {
  useDataSourceSelectModal,
} from '../DataSourceSelectModal/DataSourceSelectModal.js';
import './ReleaseForm.css';

export interface ReleaseFormProps {
  className?: string;
  releaseId: string;
  buttonLabel?: string;
}

export function ReleaseForm(props: ReleaseFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!props.releaseId);
  const [release, setRelease] = useState<Release | null>(null);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [dataSourceIds, setDataSourceIds] = useState<string[]>([]);
  const docSelectModal = useDocSelectModal();
  const dataSourceSelectModal = useDataSourceSelectModal();

  async function fetchRelease(releaseId: string) {
    console.log(releaseId);
    await notifyErrors(async () => {
      const release = await getRelease(releaseId);
      setRelease(release);
      setDocIds(release?.docIds || []);
      setDataSourceIds(release?.dataSourceIds || []);
    });
    setLoading(false);
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
      dataSourceIds: dataSourceIds,
    };

    try {
      setRelease(release);
      setSubmitting(true);
      if (props.releaseId) {
        await updateRelease(props.releaseId, release);
        showNotification({
          title: 'Saved release',
          message: `Updated ${releaseId}`,
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
      }
      route(`/cms/releases/${releaseId}`);
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

  function openDataSourceSelectModal() {
    dataSourceSelectModal.open({
      selectedDataSourceIds: dataSourceIds,
      onChange: (id: string, selected: boolean) => {
        setDataSourceIds((old) => {
          const next = [...old];
          if (selected) {
            next.push(id);
          } else {
            const i = next.indexOf(id);
            if (i > -1) {
              next.splice(i, 1);
            }
          }
          return next.sort();
        });
      },
    });
  }

  function onRemoveDoc(docId: string) {
    console.log('onRemoveDoc()', docId);
    setDocIds((current) => {
      const newDocIds = [...current];
      const index = newDocIds.indexOf(docId);
      if (index !== -1) {
        newDocIds.splice(index, 1);
      }
      console.log(newDocIds);
      return newDocIds;
    });
  }

  function onRemoveDataSource(id: string) {
    setDataSourceIds((current) => {
      const newIds = [...current];
      const index = newIds.indexOf(id);
      if (index !== -1) {
        newIds.splice(index, 1);
      }
      return newIds;
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
        {docIds.length > 0 && (
          <ReleaseForm.DocPreviewCards
            docIds={docIds!}
            onRemoveDoc={onRemoveDoc}
          />
        )}
        <Button
          className="ReleaseForm__docSelectButton"
          color="dark"
          size="xs"
          onClick={() => openDocSelectModal()}
        >
          {'Select'}
        </Button>
      </InputWrapper>
      <InputWrapper
        className="ReleaseForm__input"
        label="Data Sources"
        description="Optional. Data sources to publish with the release."
        size="xs"
      >
        {dataSourceIds.length > 0 && (
          <ReleaseForm.DataSourceIds
            ids={dataSourceIds}
            onRemove={onRemoveDataSource}
          />
        )}
        <Button
          className="ReleaseForm__docSelectButton"
          color="dark"
          size="xs"
          onClick={() => openDataSourceSelectModal()}
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

ReleaseForm.DocPreviewCards = (props: {
  docIds: string[];
  onRemoveDoc: (docId: string) => void;
}) => {
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
                  onClick={() => props.onRemoveDoc(docId)}
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

ReleaseForm.DataSourceIds = (props: {
  ids: string[];
  onRemove: (id: string) => void;
}) => {
  return (
    <div className="ReleaseForm__DataSourceIds">
      {props.ids.map((id) => (
        <div key={id} className="ReleaseForm__DataSourceIds__item">
          <span className="ReleaseForm__DataSourceIds__item__id">{id}</span>
          <ActionIcon
            className="ReleaseForm__DataSourceIds__item__remove"
            onClick={() => props.onRemove(id)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </div>
      ))}
    </div>
  );
};
