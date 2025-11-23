import './DocPickerModal.css';

import {Button, Loader, Select, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {IconSearch} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';

import {useDocsList} from '../../hooks/useDocsList.js';
import {useFilteredDocs} from '../../hooks/useFilteredDocs.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {getNestedValue} from '../../utils/objects.js';
import {DocStatusBadges} from '../DocStatusBadges/DocStatusBadges.js';
import {FilePreview} from '../FilePreview/FilePreview.js';
import {NewDocModal} from '../NewDocModal/NewDocModal.js';

const MODAL_ID = 'DocPickerModal';

export interface DocPickerModalProps {
  [key: string]: unknown;
  collections?: string[];
  initialCollection?: string;
  selectedDocIds?: string[];

  onChange?: (id: string) => void;
  onChangeMulti?: (docId: string, selected: boolean) => void | Promise<void>;

  /** Whether to allow selecting multiple docs. */
  multiSelect?: boolean;

  /** Enable search functionality. */
  enableSearch?: boolean;

  /** Enable sort functionality. */
  enableSort?: boolean;

  /** Enable create new doc functionality. */
  enableCreate?: boolean;

  /** Enable status badges display. */
  enableStatusBadges?: boolean;
}

export function useDocPickerModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: DocPickerModalProps) => {
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

export function DocPickerModal(
  modalProps: ContextModalProps<DocPickerModalProps>
) {
  const {innerProps: props} = modalProps;
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

  const [lastSelectedCollection, setLastSelectedCollection] =
    useLocalStorage<string>('DocPickerModal.lastSelectedCollection', '');

  // Fetch the initial collection from local storage (so it remembers)
  // the last selected collection between openings of the modal.
  const getInitialCollection = () => {
    if (props.initialCollection) {
      return props.initialCollection;
    }
    if (
      lastSelectedCollection &&
      collections.includes(lastSelectedCollection)
    ) {
      return lastSelectedCollection;
    }
    return collections.length === 1 ? collections[0] : '';
  };

  const [selectedCollectionId, setSelectedCollectionId] = useState(
    getInitialCollection()
  );

  const handleCollectionChange = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setLastSelectedCollection(collectionId);
  };

  function onDocSelected(doc: any) {
    if (props.multiSelect && props.onChangeMulti) {
      props.onChangeMulti(doc.id, true);
    } else if (props.onChange) {
      props.onChange(doc.id);
    }
  }

  function onDocUnselected(doc: any) {
    if (props.multiSelect && props.onChangeMulti) {
      props.onChangeMulti(doc.id, false);
    }
  }

  return (
    <div className="DocPickerModal">
      {collections.length === 0 && (
        <div className="DocPickerModal__noCollections">
          No collections matching schema field definition.
        </div>
      )}
      {collections.length > 0 && (
        <DocPickerModal.DocsList
          collection={selectedCollectionId}
          onDocSelected={onDocSelected}
          onDocUnselected={onDocUnselected}
          onCollectionChange={handleCollectionChange}
          multiSelect={props.multiSelect}
          selectedDocIds={props.selectedDocIds}
          options={{
            enableSearch: props.enableSearch ?? true,
            enableSort: props.enableSort ?? true,
            enableCreate: props.enableCreate ?? true,
            enableStatusBadges: props.enableStatusBadges ?? true,
            showCollectionSelect: collections.length > 1,
            collectionSelectValue: selectedCollectionId,
            collectionSelectOptions: dropdownValues,
          }}
        />
      )}
    </div>
  );
}

interface DocPickerModalOptions {
  enableSearch?: boolean;
  enableSort?: boolean;
  enableCreate?: boolean;
  enableStatusBadges?: boolean;
  showCollectionSelect?: boolean;
  collectionSelectValue?: string;
  collectionSelectOptions?: Array<{value: string; label: string}>;
}

DocPickerModal.DocsList = (props: {
  collection: string;
  onDocSelected: (doc: any) => void;
  onDocUnselected: (doc: any) => void;
  onCollectionChange?: (value: string) => void;
  multiSelect?: boolean;
  selectedDocIds?: string[];
  options?: DocPickerModalOptions;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useLocalStorage<string>(
    `root::DocPickerModal:${props.collection}:sortBy`,
    'modifiedAt'
  );
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);

  const [loading, refreshDocs, docs] = useDocsList(props.collection || '', {
    orderBy: sortBy,
  });

  const filteredDocs = useFilteredDocs(docs, searchQuery);

  const sortOptions = [
    {value: 'modifiedAt', label: 'Last Modified'},
    {value: 'slug', label: 'A-Z'},
    {value: 'slugDesc', label: 'Z-A'},
    {value: 'newest', label: 'Newest'},
    {value: 'oldest', label: 'Oldest'},
  ];

  const selectedDocIds = props.selectedDocIds || [];
  const options = props.options || {};

  return (
    <div className="DocPickerModal__DocsList">
      <div className="DocPickerModal__DocsList__stickyHeader">
        {options.showCollectionSelect && (
          <div className="DocPickerModal__collection__select">
            <div className="DocPickerModal__collection__select__label">
              Content Type:
            </div>
            <Select
              data={options.collectionSelectOptions || []}
              value={options.collectionSelectValue}
              placeholder={'Select'}
              onChange={(e: string) => {
                props.onCollectionChange?.(e || '');
              }}
              size="xs"
              radius={0}
              searchable
              autoFocus
              // Due to issues with preact/compat, use a div for the dropdown el.
              dropdownComponent="div"
            />
            {options.collectionSelectValue && (
              <Button
                variant="outline"
                color="dark"
                size="xs"
                onClick={() => setNewDocModalOpen(true)}
              >
                New
              </Button>
            )}
          </div>
        )}
        {options.enableSearch && options.collectionSelectValue && (
          <div className="DocPickerModal__DocsList__controls">
            <TextInput
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
              size="xs"
              className="DocPickerModal__DocsList__controls__search"
            />
            {options.enableSort && (
              <Select
                data={sortOptions}
                value={sortBy}
                onChange={(value: string) => setSortBy(value || 'modifiedAt')}
                size="xs"
                className="DocPickerModal__DocsList__controls__sort"
              />
            )}
          </div>
        )}
        {!loading && docs.length > 0 && (
          <div className="DocPickerModal__DocsList__count">
            Showing {filteredDocs.length} of {docs.length} documents
          </div>
        )}
      </div>
      <div className="DocPickerModal__DocsList__docsContainer">
        {!props.collection ? (
          <div className="DocPickerModal__DocsList__empty">
            Select a content type to view documents
          </div>
        ) : loading ? (
          <div className="DocPickerModal__DocsList__loading">
            <Loader color="gray" size="xl" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="DocPickerModal__DocsList__empty">
            {docs.length === 0
              ? 'Collection is empty.'
              : 'No documents match your search.'}
          </div>
        ) : (
          <div className="DocPickerModal__DocsList__docs">
            {filteredDocs.map((doc: any) => (
              <DocPickerModal.DocCard
                key={doc.id}
                doc={doc}
                onDocSelected={props.onDocSelected}
                onDocUnselected={props.onDocUnselected}
                multiSelect={props.multiSelect}
                selected={selectedDocIds.includes(doc.id)}
                enableStatusBadges={options.enableStatusBadges}
              />
            ))}
          </div>
        )}
      </div>
      {options.collectionSelectValue && (
        <NewDocModal
          collection={options.collectionSelectValue}
          opened={newDocModalOpen}
          skipNavigation={true}
          onClose={() => {
            setNewDocModalOpen(false);
            refreshDocs();
          }}
        />
      )}
    </div>
  );
};

DocPickerModal.DocCard = (props: {
  doc: any;
  onDocSelected: (doc: any) => void;
  onDocUnselected: (doc: any) => void;
  multiSelect?: boolean;
  selected?: boolean;
  enableStatusBadges?: boolean;
}) => {
  const [selected, setSelected] = useState(!!props.selected);
  const doc = props.doc;
  const [collection, slug] = doc.id.split('/');
  const fields = doc.fields || {};
  const rootCollection = window.__ROOT_CTX.collections[collection];
  const cmsUrl = `/cms/content/${collection}/${slug}`;
  const previewTitle = getNestedValue(
    fields,
    rootCollection.preview?.title || 'meta.title'
  );
  const previewImage =
    getNestedValue(fields, rootCollection.preview?.image || 'meta.image') ||
    rootCollection.preview?.defaultImage;
  return (
    <div className="DocPickerModal__DocCard">
      <div
        className="DocPickerModal__DocCard__image"
        onClick={() => window.open(cmsUrl, '_blank')}
      >
        <FilePreview
          file={previewImage}
          width={120}
          height={90}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div className="DocPickerModal__DocCard__content">
        <div className="DocPickerModal__DocCard__content__header">
          <div
            className="DocPickerModal__DocCard__content__header__docId"
            onClick={() => window.open(cmsUrl, '_blank')}
          >
            {doc.id}
          </div>
        </div>
        <div className="DocPickerModal__DocCard__content__title">
          <div
            className="DocPickerModal__DocCard__content__link"
            onClick={() => window.open(cmsUrl, '_blank')}
          >
            {previewTitle || '[UNTITLED]'}
          </div>
        </div>
        {props.enableStatusBadges && (
          <div className="DocPickerModal__DocCard__content__badges">
            <DocStatusBadges doc={doc} />
          </div>
        )}
      </div>
      <div className="DocPickerModal__DocCard__controls">
        <div className="DocPickerModal__DocCard__controls__buttons">
          {props.multiSelect ? (
            selected ? (
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
            )
          ) : (
            <Button
              color="blue"
              size="xs"
              onClick={() => props.onDocSelected(props.doc)}
            >
              Select
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

DocPickerModal.id = MODAL_ID;
