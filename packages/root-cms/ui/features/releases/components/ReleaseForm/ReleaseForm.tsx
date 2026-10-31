import {IconArrowUpRight, IconTrash} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {isSlugValid} from '../../../../../shared/slug.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Field} from '../../../../primitives/Field/Field.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {LoadingOverlay} from '../../../../primitives/LoadingOverlay/LoadingOverlay.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {useDocPickerModal} from '../../../collections/components/DocPickerModal/useDocPickerModal.js';
import {DocPreviewCard} from '../../../collections/components/DocPreviewCard/DocPreviewCard.js';
import {DataSourceIcon} from '../../../data-sources/components/DataSourceIcon/DataSourceIcon.js';
import {useDataSourceSelectModal} from '../../../data-sources/components/DataSourceSelectModal/useDataSourceSelectModal.js';
import {DataSource, getDataSource} from '../../../data-sources/data-source.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {
  Release,
  addRelease,
  generateReleaseId,
  getRelease,
  updateRelease,
} from '../../release.js';

export interface ReleaseFormProps {
  className?: string;
  releaseId?: string;
  buttonLabel?: string;
}

export function ReleaseForm(props: ReleaseFormProps) {
  const {route} = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!props.releaseId);
  const [release, setRelease] = useState<Release | null>(null);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [dataSourceIds, setDataSourceIds] = useState<string[]>([]);
  const docPickerModal = useDocPickerModal();
  const dataSourceSelectModal = useDataSourceSelectModal();

  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

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

  function openDocPickerModal() {
    docPickerModal.open({
      multiSelect: true,
      selectedDocIds: docIds,
      onChangeMulti: (docId: string, selected: boolean) => {
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
      className={cn(
        'ReleaseForm relative flex max-w-162 flex-col gap-4 text-base',
        props.className
      )}
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
        defaultValue={props.releaseId || generateReleaseId()}
        disabled={!!props.releaseId}
      />
      <Textarea
        className="ReleaseForm__input"
        name="description"
        label="Description"
        description="Optional."
        value={release?.description}
        disabled={!canPublish}
      />
      <Field
        className="ReleaseForm__input"
        labelAs="div"
        label="Docs"
        description="Select one or more docs to add to the release. Note: you can add or edit this list at a later time, if needed."
      >
        {docIds.length > 0 && (
          <ReleaseForm.DocPreviewCards
            docIds={docIds!}
            onRemoveDoc={onRemoveDoc}
            canEdit={canPublish}
          />
        )}
        <Button
          className="ReleaseForm__selectButton mt-1.5 self-start"
          variant="primary"
          onClick={() => openDocPickerModal()}
          disabled={!canPublish}
        >
          {'Select'}
        </Button>
      </Field>
      <Field
        className="ReleaseForm__input"
        labelAs="div"
        label="Data Sources"
        description="Optional. Data sources to publish with the release."
      >
        {dataSourceIds.length > 0 && (
          <ReleaseForm.DataSourceIds
            ids={dataSourceIds}
            onRemove={onRemoveDataSource}
            canEdit={canPublish}
          />
        )}
        <Button
          className="ReleaseForm__selectButton mt-1.5 self-start"
          variant="primary"
          onClick={() => openDataSourceSelectModal()}
          disabled={!canPublish}
        >
          {'Select'}
        </Button>
      </Field>
      <div className="ReleaseForm__buttons mt-10 flex gap-3">
        <ConditionalTooltip
          label="You don't have access to create or edit releases"
          condition={!canPublish}
        >
          <Button
            className="ReleaseForm__submit"
            variant="blue"
            type="submit"
            loading={submitting}
            disabled={!canPublish}
          >
            {props.buttonLabel || 'Save'}
          </Button>
        </ConditionalTooltip>
      </div>
      {error && (
        <div className="ReleaseForm__error mt-4 text-base font-medium text-danger">
          Error: {error}
        </div>
      )}
    </form>
  );
}

ReleaseForm.DocPreviewCards = (props: {
  docIds: string[];
  onRemoveDoc: (docId: string) => void;
  canEdit: boolean;
}) => {
  return (
    <div className="ReleaseForm__docs my-4 border-0 border-t border-solid border-border">
      {props.docIds.map((docId) => (
        <div
          key={docId}
          className="ReleaseForm__doc flex gap-3 border-0 border-b border-solid border-border"
        >
          <DocPreviewCard
            className="ReleaseForm__docPreview min-w-0 flex-1"
            docId={docId}
            variant="compact"
          />
          <div className="ReleaseForm__docControls flex shrink-0 gap-0.5 pt-2">
            {props.canEdit && (
              <IconButton
                className="ReleaseForm__docRemove"
                label="Remove"
                onClick={() => props.onRemoveDoc(docId)}
              >
                <IconTrash />
              </IconButton>
            )}
            <IconButton
              className="ReleaseForm__docOpen"
              label="Open"
              href={`/cms/content/${docId}`}
              target="_blank"
            >
              <IconArrowUpRight />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
};

ReleaseForm.DataSourceIds = (props: {
  ids: string[];
  onRemove: (id: string) => void;
  canEdit: boolean;
}) => {
  const [dataSources, setDataSources] = useState<Record<string, DataSource>>(
    {}
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const entries = await Promise.all(
        props.ids.map(async (id) => {
          const ds = await getDataSource(id);
          return [id, ds] as const;
        })
      );
      if (cancelled) {
        return;
      }
      const map: Record<string, DataSource> = {};
      for (const [id, ds] of entries) {
        if (ds) {
          map[id] = ds;
        }
      }
      setDataSources(map);
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [props.ids.join(',')]);

  return (
    <div className="ReleaseForm__dataSources my-4 border-0 border-t border-solid border-border">
      {props.ids.map((id) => {
        const ds = dataSources[id];
        return (
          <div
            key={id}
            className="ReleaseForm__dataSource flex items-center gap-3 border-0 border-b border-solid border-border py-3"
          >
            <DataSourceIcon
              className="ReleaseForm__dataSourceIcon"
              type={ds?.type}
            />
            <div className="ReleaseForm__dataSourceInfo min-w-0 flex-1">
              <div className="ReleaseForm__dataSourceId break-words text-lg font-semibold leading-snug text-fg">
                {id}
              </div>
              {ds?.description && (
                <div className="ReleaseForm__dataSourceDescription mt-0.5 text-sm text-muted">
                  {ds.description}
                </div>
              )}
            </div>
            {props.canEdit && (
              <IconButton
                className="ReleaseForm__dataSourceRemove"
                label="Remove"
                onClick={() => props.onRemove(id)}
              >
                <IconTrash />
              </IconButton>
            )}
          </div>
        );
      })}
    </div>
  );
};
