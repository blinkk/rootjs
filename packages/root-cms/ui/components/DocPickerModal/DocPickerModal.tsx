import {Button, Loader, Select, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {IconExternalLink, IconSearch} from '@tabler/icons-preact';
import {useMemo, useState} from 'preact/hooks';

import {useDocsList} from '../../hooks/useDocsList.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {getNestedValue} from '../../utils/objects.js';
import {DocStatusBadges} from '../DocStatusBadges/DocStatusBadges.js';
import {FilePreview} from '../FilePreview/FilePreview.js';
import './DocPickerModal.css';

const MODAL_ID = 'DocPickerModal';

export interface DocPickerModalProps {
  [key: string]: unknown;
  collections?: string[];
  initialCollection?: string;
  // Single-select mode (default)
  onChange?: (id: string) => void;
  // Multi-select mode
  multiSelect?: boolean;
  selectedDocIds?: string[];
  onChangeMulti?: (docId: string, selected: boolean) => void | Promise<void>;
  // Feature flags (opt-in)
  enableSearch?: boolean;
  enableSort?: boolean;
  enableCreate?: boolean;
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

  const [selectedCollectionId, setSelectedCollectionId] = useState(
    props.initialCollection || (collections.length === 1 ? collections[0] : '')
  );

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
          multiSelect={props.multiSelect}
          selectedDocIds={props.selectedDocIds}
          enableSearch={props.enableSearch ?? true}
          enableSort={props.enableSort ?? true}
          enableCreate={props.enableCreate ?? true}
          enableStatusBadges={props.enableStatusBadges ?? true}
          showCollectionSelect={collections.length > 1}
          collectionSelectValue={selectedCollectionId}
          collectionSelectOptions={dropdownValues}
          onCollectionChange={setSelectedCollectionId}
        />
      )}
    </div>
  );
}

DocPickerModal.DocsList = (props: {
  collection: string;
  onDocSelected: (doc: any) => void;
  onDocUnselected: (doc: any) => void;
  multiSelect?: boolean;
  selectedDocIds?: string[];
  enableSearch?: boolean;
  enableSort?: boolean;
  enableCreate?: boolean;
  enableStatusBadges?: boolean;
  showCollectionSelect?: boolean;
  collectionSelectValue?: string;
  collectionSelectOptions?: Array<{value: string; label: string}>;
  onCollectionChange?: (value: string) => void;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('modifiedAt');

  const [loading, , docs] = useDocsList(props.collection || '', {
    orderBy: sortBy,
  });

  // Filter docs based on search query
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) {
      return docs;
    }
    const query = searchQuery.toLowerCase();
    return docs.filter((doc: any) => {
      const [collection, slug] = doc.id.split('/');
      const fields = doc.fields || {};
      const rootCollection = window.__ROOT_CTX.collections[collection];
      const previewTitle = getNestedValue(
        fields,
        rootCollection.preview?.title || 'meta.title'
      );
      const title = previewTitle || '';
      return (
        doc.id.toLowerCase().includes(query) ||
        title.toLowerCase().includes(query) ||
        slug.toLowerCase().includes(query)
      );
    });
  }, [docs, searchQuery]);

  const sortOptions = [
    {value: 'modifiedAt', label: 'Last Modified'},
    {value: 'slug', label: 'A-Z'},
    {value: 'slugDesc', label: 'Z-A'},
    {value: 'newest', label: 'Newest'},
    {value: 'oldest', label: 'Oldest'},
  ];

  const selectedDocIds = props.selectedDocIds || [];

  return (
    <div className="DocPickerModal__DocsList">
      <div className="DocPickerModal__DocsList__stickyHeader">
        {props.showCollectionSelect && (
          <div className="DocPickerModal__collection__select">
            <div className="DocPickerModal__collection__select__label">
              Content Type:
            </div>
            <Select
              data={props.collectionSelectOptions || []}
              value={props.collectionSelectValue}
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
            {props.collectionSelectValue && (
              <Button
                variant="outline"
                color="dark"
                size="xs"
                rightIcon={<IconExternalLink size={14} />}
                onClick={() => {
                  const url = `/cms/content/${props.collectionSelectValue}`;
                  window.open(url, '_blank');
                }}
              >
                New
              </Button>
            )}
          </div>
        )}
        {props.enableSearch && props.collectionSelectValue && (
          <div className="DocPickerModal__DocsList__controls">
            <TextInput
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
              size="xs"
              className="DocPickerModal__DocsList__controls__search"
            />
            {props.enableSort && (
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
            {filteredDocs.map((doc) => (
              <DocPickerModal.DocCard
                key={doc.id}
                doc={doc}
                onDocSelected={props.onDocSelected}
                onDocUnselected={props.onDocUnselected}
                multiSelect={props.multiSelect}
                selected={selectedDocIds.includes(doc.id)}
                enableStatusBadges={props.enableStatusBadges}
              />
            ))}
          </div>
        )}
      </div>
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
  const hasCollectionUrl = !!rootCollection.url;
  // const cmsUrl = `/cms/content/${collection}/${slug}`;
  const liveUrl = hasCollectionUrl
    ? getDocServingUrl({
        collectionId: collection,
        slug: slug,
      })
    : '';
  const previewTitle = getNestedValue(
    fields,
    rootCollection.preview?.title || 'meta.title'
  );
  const previewImage =
    getNestedValue(fields, rootCollection.preview?.image || 'meta.image') ||
    rootCollection.preview?.defaultImage;
  return (
    <div className="DocPickerModal__DocCard">
      <div className="DocPickerModal__DocCard__image">
        <FilePreview
          file={previewImage}
          width={120}
          height={90}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div className="DocPickerModal__DocCard__content">
        <div className="DocPickerModal__DocCard__content__header">
          <div className="DocPickerModal__DocCard__content__header__docId">
            {doc.id}
          </div>
          {props.enableStatusBadges && <DocStatusBadges doc={doc} />}
        </div>
        <div className="DocPickerModal__DocCard__content__title">
          {previewTitle || '[UNTITLED]'}
        </div>
        {hasCollectionUrl && liveUrl && (
          <div className="DocPickerModal__DocCard__content__url">{liveUrl}</div>
        )}
      </div>
      <div className="DocPickerModal__DocCard__controls">
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
  );
};

DocPickerModal.id = MODAL_ID;

// Backwards compatibility: export useDocSelectModal as an alias
export const useDocSelectModal = useDocPickerModal;
export type DocSelectModalProps = DocPickerModalProps;
