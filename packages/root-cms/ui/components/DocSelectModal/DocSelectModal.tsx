import {Button, Image, Loader, Select} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {useState} from 'preact/hooks';
import {useDocsList} from '../../hooks/useDocsList.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import './DocSelectModal.css';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {getNestedValue} from '../../utils/objects.js';

const MODAL_ID = 'DocSelectModal';

export interface DocSelectModalProps {
  [key: string]: unknown;
  collections?: string[];
  initialCollection?: string;
  onChange?: (docId: string, selected: boolean) => void | Promise<void>;
  selectedDocIds?: string[];
}

export function useDocSelectModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: DocSelectModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: '700px',
        overflow: 'inside',
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function DocSelectModal(
  modalProps: ContextModalProps<DocSelectModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  let collections = Object.keys(window.__ROOT_CTX.collections);
  if (props.collections?.length) {
    collections = collections.filter(
      (collection) => props.collections?.includes(collection)
    );
  }

  const dropdownValues: Array<{value: string; label: string}> = [
    {value: '', label: 'Select'},
  ];
  collections.forEach((collection) => {
    dropdownValues.push({value: collection, label: collection});
  });

  const [selectedCollectionId, setSelectedCollectionId] = useState(
    props.initialCollection || (collections.length === 1 ? collections[0] : '')
  );

  function onDocSelected(doc: any) {
    if (props.onChange) {
      props.onChange(doc.id, true /* selected */);
    }
  }

  function onDocUnselected(doc: any) {
    if (props.onChange) {
      props.onChange(doc.id, false /* selected */);
    }
  }

  console.log('selected docs:', props.selectedDocIds);

  return (
    <div className="DocSelectModal">
      {collections.length === 0 && (
        <div className="DocSelectModal__noCollections">
          No collections matching schema field definition.
        </div>
      )}
      {collections.length > 1 && (
        <div className="DocSelectModal__collection__select">
          <div className="DocSelectModal__collection__select__label">
            Content Type:
          </div>
          <Select
            data={dropdownValues}
            value={selectedCollectionId}
            placeholder={'Select'}
            onChange={(e: string) => {
              setSelectedCollectionId(e || '');
            }}
            size="xs"
            radius={0}
            // Due to issues with preact/compat, use a div for the dropdown el.
            dropdownComponent="div"
          />
        </div>
      )}
      {selectedCollectionId && (
        <DocSelectModal.DocsList
          collection={selectedCollectionId}
          onDocSelected={onDocSelected}
          onDocUnselected={onDocUnselected}
          selectedDocIds={props.selectedDocIds}
        />
      )}
    </div>
  );
}

DocSelectModal.DocsList = (props: {
  collection: string;
  onDocSelected: (doc: any) => void;
  onDocUnselected: (doc: any) => void;
  selectedDocIds?: string[];
}) => {
  const [loading, , docs] = useDocsList(props.collection, {
    orderBy: 'slug',
  });
  const selectedDocIds = props.selectedDocIds || [];
  return (
    <div className="DocSelectModal__DocsList">
      {loading ? (
        <div className="DocSelectModal__DocsList__loading">
          <Loader color="gray" size="xl" />
        </div>
      ) : docs.length === 0 ? (
        <div className="DocSelectModal__DocsList__empty">
          Collection is empty.
        </div>
      ) : (
        <div className="DocSelectModal__DocsList__docs">
          {docs.map((doc) => (
            <DocSelectModal.DocCard
              key={doc.id}
              doc={doc}
              onDocSelected={props.onDocSelected}
              onDocUnselected={props.onDocUnselected}
              selected={selectedDocIds.includes(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

DocSelectModal.DocCard = (props: {
  doc: any;
  onDocSelected: (doc: any) => void;
  onDocUnselected: (doc: any) => void;
  selected?: boolean;
}) => {
  const [selected, setSelected] = useState(!!props.selected);
  const doc = props.doc;
  const [collection, slug] = doc.id.split('/');
  const fields = doc.fields || {};
  const rootCollection = window.__ROOT_CTX.collections[collection];
  // const cmsUrl = `/cms/content/${collection}/${slug}`;
  const liveUrl = getDocServingUrl({
    collectionId: collection,
    slug: slug,
  });
  const previewTitle = getNestedValue(
    fields,
    rootCollection.preview?.title || 'meta.title'
  );
  const previewImage =
    getNestedValue(fields, rootCollection.preview?.image || 'meta.image') ||
    rootCollection.preview?.defaultImage;
  return (
    <div className="DocSelectModal__DocCard">
      <div className="DocSelectModal__DocCard__image">
        <Image
          src={previewImage?.src}
          width={120}
          height={90}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div className="DocSelectModal__DocCard__content">
        <div className="DocSelectModal__DocCard__content__header">
          <div className="DocSelectModal__DocCard__content__header__docId">
            {doc.id}
          </div>
        </div>
        <div className="DocSelectModal__DocCard__content__title">
          {previewTitle || '[UNTITLED]'}
        </div>
        <div className="DocSelectModal__DocCard__content__url">{liveUrl}</div>
      </div>
      <div className="DocSelectModal__DocCard__controls">
        {selected ? (
          <Button
            variant="light"
            color="blue"
            size="xs"
            onClick={() => {
              setSelected(false);
              props.onDocUnselected(props.doc);
            }}
          >
            Unselect
          </Button>
        ) : (
          <Button
            variant="filled"
            color="blue"
            size="xs"
            onClick={() => {
              setSelected(true);
              props.onDocSelected(props.doc);
            }}
          >
            Select
          </Button>
        )}
      </div>
    </div>
  );
};

DocSelectModal.id = MODAL_ID;
