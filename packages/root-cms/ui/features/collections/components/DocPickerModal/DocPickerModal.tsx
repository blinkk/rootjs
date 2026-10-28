import {IconSearch} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';

import {FilePreview} from '../../../../components/FilePreview/FilePreview.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../utils/classes.js';
import {getNestedValue} from '../../../../utils/objects.js';
import {DocStatusBadges} from '../../../documents/components/DocStatusBadges/DocStatusBadges.js';
import {useDensity} from '../../useDensity.js';
import {useDocsList} from '../../useDocsList.js';
import {useFilteredDocs} from '../../useFilteredDocs.js';
import {NewDocModal} from '../NewDocModal/NewDocModal.js';

const MODAL_ID = 'DocPickerModal';

const EMPTY_CLASSES =
  'DocPickerModal__DocsList__empty px-5 py-10 text-center text-base text-muted';

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
  return {
    open: (props: DocPickerModalProps) => {
      modals.openContextModal(MODAL_ID, {
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
    collections = collections.filter((collection) =>
      props.collections?.includes(collection)
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
        <div className="DocPickerModal__noCollections p-5 text-center text-base text-muted">
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

  // Render the condensed rows when the collection forces the compact listing
  // (`viewOptions: {compact: true}`) or when the user's preferred listing
  // density is compact.
  const {density} = useDensity(props.collection);
  const compact = density === 'compact';

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
    <div className="DocPickerModal__DocsList flex h-full flex-col">
      <div className="DocPickerModal__DocsList__stickyHeader sticky top-0 z-(--cms-z-sticky) mb-2 border-b border-border bg-surface">
        {options.showCollectionSelect && (
          <div className="DocPickerModal__collection__select mb-5 flex flex-wrap items-center gap-2">
            <div className="DocPickerModal__collection__select__label text-base font-semibold">
              Content Type:
            </div>
            <Select
              className="min-w-0 flex-1 sm:flex-none"
              aria-label="Content type"
              data={options.collectionSelectOptions || []}
              value={options.collectionSelectValue}
              placeholder={'Select'}
              onValueChange={(value) => {
                props.onCollectionChange?.(value || '');
              }}
              searchable
              autoFocus
            />
            {options.collectionSelectValue && (
              <Button onClick={() => setNewDocModalOpen(true)}>New</Button>
            )}
          </div>
        )}
        {options.enableSearch && options.collectionSelectValue && (
          <div className="DocPickerModal__DocsList__controls mb-3 flex flex-wrap items-center gap-3 border-b border-border pb-3 last:mb-0 last:border-b-0">
            <TextInput
              aria-label="Search documents"
              placeholder="Search documents..."
              value={searchQuery}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              leftSection={<IconSearch />}
              className="DocPickerModal__DocsList__controls__search min-w-50 flex-1"
            />
            {options.enableSort && (
              <Select
                aria-label="Sort"
                data={sortOptions}
                value={sortBy}
                onValueChange={(value) => setSortBy(value || 'modifiedAt')}
                className="DocPickerModal__DocsList__controls__sort min-w-35"
              />
            )}
          </div>
        )}
        {!loading && docs.length > 0 && (
          <div className="DocPickerModal__DocsList__count mb-3 px-1 text-sm text-muted">
            Showing {filteredDocs.length} of {docs.length} documents
          </div>
        )}
      </div>
      <div className="DocPickerModal__DocsList__docsContainer min-h-0 flex-1 overflow-y-auto">
        {!props.collection ? (
          <div className={EMPTY_CLASSES}>
            Select a content type to view documents
          </div>
        ) : loading ? (
          <div className="DocPickerModal__DocsList__loading flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className={EMPTY_CLASSES}>
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
                compact={compact}
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

/**
 * A row in the doc picker's listing. The `compact` variant renders a condensed
 * single-line row (small thumbnail, doc id, title, badges), mirroring the
 * compact listing on the collection page.
 */
DocPickerModal.DocCard = (props: {
  doc: any;
  onDocSelected: (doc: any) => void;
  onDocUnselected: (doc: any) => void;
  multiSelect?: boolean;
  selected?: boolean;
  enableStatusBadges?: boolean;
  compact?: boolean;
}) => {
  const [selected, setSelected] = useState(!!props.selected);
  const compact = !!props.compact;
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
    <div
      className={cn(
        'DocPickerModal__DocCard',
        compact && 'DocPickerModal__DocCard--compact',
        'flex items-center overflow-hidden border-t border-border pr-2 first:border-t-0',
        compact ? 'gap-3 py-1' : 'py-2'
      )}
    >
      <div
        className={cn(
          'DocPickerModal__DocCard__image shrink-0 cursor-pointer border border-border',
          !compact && 'hidden sm:block'
        )}
        onClick={() => window.open(cmsUrl, '_blank')}
      >
        <FilePreview
          file={previewImage}
          width={compact ? 40 : 120}
          height={compact ? 30 : 90}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div
        className={cn(
          'DocPickerModal__DocCard__content flex min-w-0 flex-1',
          compact ? 'flex-row items-center gap-3 px-1' : 'flex-col sm:px-3'
        )}
      >
        <div
          className={cn(
            'DocPickerModal__DocCard__content__header flex items-center gap-2',
            compact ? 'min-w-0 max-w-2/5 flex-initial' : 'flex-wrap'
          )}
        >
          <div
            className={cn(
              'DocPickerModal__DocCard__content__header__docId cursor-pointer font-medium',
              compact ? 'truncate text-sm text-muted' : 'text-base'
            )}
            onClick={() => window.open(cmsUrl, '_blank')}
          >
            {doc.id}
          </div>
        </div>
        <div
          className={cn(
            'DocPickerModal__DocCard__content__title cursor-pointer font-semibold',
            compact
              ? 'min-w-0 flex-1 text-base leading-5'
              : 'line-clamp-1 text-xl leading-normal sm:text-2xl sm:leading-9'
          )}
        >
          <div
            className={cn(
              'DocPickerModal__DocCard__content__link cursor-pointer',
              compact ? 'truncate' : 'inline-block'
            )}
            onClick={() => window.open(cmsUrl, '_blank')}
          >
            {previewTitle || '[UNTITLED]'}
          </div>
        </div>
        {props.enableStatusBadges && (
          <div
            className={cn(
              'DocPickerModal__DocCard__content__badges flex items-center gap-1',
              compact ? 'flex-none flex-nowrap' : 'mt-1 flex-wrap'
            )}
          >
            <DocStatusBadges doc={doc} />
          </div>
        )}
      </div>
      <div className="DocPickerModal__DocCard__controls flex flex-col items-center gap-2">
        <div className="DocPickerModal__DocCard__controls__buttons flex items-center gap-2">
          {props.multiSelect ? (
            selected ? (
              <Button
                size={compact ? 'xs' : 'sm'}
                onClick={() => {
                  setSelected(false);
                  props.onDocUnselected(props.doc);
                }}
              >
                Unselect
              </Button>
            ) : (
              <Button
                variant="primary"
                size={compact ? 'xs' : 'sm'}
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
              variant="primary"
              size={compact ? 'xs' : 'sm'}
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
