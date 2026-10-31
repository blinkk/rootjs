import {
  IconLayoutGrid,
  IconLayoutList,
  IconSearch,
  IconTrash,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';

import * as schema from '../../../../../core/schema.js';
import {FilePreview} from '../../../../components/FilePreview/FilePreview.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {DialogFooter} from '../../../../primitives/Dialog/Dialog.js';
import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../utils/classes.js';
import {COMPONENT_PICKER_MODAL_ID} from './useComponentPickerModal.js';

const LAYOUT_STORAGE_KEY = 'root::ComponentPickerModal:layout';

export type ComponentPickerLayout = 'list' | 'grid';

export interface ComponentPickerOption {
  /** Stable key for reconciliation. */
  key: string;
  /** Schema this option uses to compute defaults / `_type`. */
  schema: schema.Schema;
  /** Optional preset; when omitted, this is the schema's "blank" card. */
  preset?: schema.SchemaPreset;
}

export interface ComponentPickerModalProps {
  [key: string]: unknown;
  /** Cards to render. The caller assembles these from `field.types` + presets. */
  options: ComponentPickerOption[];
  /** Optional placeholder text for the search input. */
  searchPlaceholder?: string;
  /** Invoked when the user clicks a card. The caller is responsible for closing. */
  onSelect: (option: ComponentPickerOption) => void;
  /**
   * Optional handler invoked when the user clicks the "Clear selection"
   * button in the footer. When omitted, the button is not rendered, so
   * callers should pass it only when there's an existing value to clear.
   * The button is also hidden while the user has an active search query.
   * The caller is responsible for closing the modal.
   */
  onRemove?: () => void;
}

export function ComponentPickerModal(
  modalProps: ContextModalProps<ComponentPickerModalProps>
) {
  const {innerProps: props} = modalProps;
  const [searchQuery, setSearchQuery] = useState('');
  const [layout, setLayout] = useLocalStorage<ComponentPickerLayout>(
    LAYOUT_STORAGE_KEY,
    'list'
  );
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return props.options;
    }
    return props.options.filter((opt) => {
      const haystack = [
        opt.schema.name,
        opt.schema.label,
        opt.schema.description,
        opt.preset?.id,
        opt.preset?.label,
        opt.preset?.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [props.options, searchQuery]);

  // Reset focus to the first card whenever the filtered list changes.
  useEffect(() => {
    setFocusedIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  // Scroll the focused card into view as the user navigates with the keyboard.
  useEffect(() => {
    if (focusedIndex < 0 || !cardsContainerRef.current) {
      return;
    }
    const cards = cardsContainerRef.current.querySelectorAll<HTMLElement>(
      '.ComponentPickerModal__Card'
    );
    cards[focusedIndex]?.scrollIntoView({block: 'nearest'});
  }, [focusedIndex]);

  /**
   * The number of cards per row: the grid has 3 columns, or 2 on narrow
   * screens, so count the cards on the first row.
   */
  function getColumnCount() {
    if (layout !== 'grid' || !cardsContainerRef.current) {
      return 1;
    }
    const cards = Array.from(
      cardsContainerRef.current.querySelectorAll<HTMLElement>(
        '.ComponentPickerModal__Card'
      )
    );
    const top = cards[0]?.offsetTop;
    const count = cards.filter((card) => card.offsetTop === top).length;
    return Math.max(1, count);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (filtered.length === 0) {
      return;
    }
    const cols = getColumnCount();
    const last = filtered.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(last, Math.max(0, i) + cols));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(0, i - cols));
    } else if (e.key === 'ArrowRight' && layout === 'grid') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(last, Math.max(0, i) + 1));
    } else if (e.key === 'ArrowLeft' && layout === 'grid') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      const opt = filtered[focusedIndex];
      if (opt) {
        e.preventDefault();
        props.onSelect(opt);
      }
    }
  }

  const showRemoveButton = !!props.onRemove && !searchQuery.trim();
  const grid = layout === 'grid';

  return (
    <div
      className={cn(
        'ComponentPickerModal flex flex-col',
        grid ? 'ComponentPickerModal--grid' : 'ComponentPickerModal--list'
      )}
      onKeyDown={handleKeyDown}
    >
      <div className="ComponentPickerModal__controls sticky top-0 z-1 mb-2 flex items-center gap-2 border-0 border-b border-solid border-border bg-surface pb-3">
        <TextInput
          // The dialog focuses the element with `data-autofocus` on open.
          data-autofocus
          aria-label="Search components"
          placeholder={props.searchPlaceholder || 'Search components...'}
          value={searchQuery}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          leftSection={<IconSearch />}
          className="ComponentPickerModal__controls__search min-w-0 flex-1"
        />
        <SegmentedControl
          className="ComponentPickerModal__controls__layout shrink-0"
          size="xs"
          aria-label="Layout"
          value={layout}
          onValueChange={(value) => setLayout(value)}
          data={[
            {
              value: 'list',
              ariaLabel: 'List layout',
              label: (
                <span className="ComponentPickerModal__controls__layout__option inline-flex h-3.5 items-center justify-center">
                  <IconLayoutList size={14} />
                </span>
              ),
            },
            {
              value: 'grid',
              ariaLabel: 'Grid layout',
              label: (
                <span className="ComponentPickerModal__controls__layout__option inline-flex h-3.5 items-center justify-center">
                  <IconLayoutGrid size={14} />
                </span>
              ),
            },
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="ComponentPickerModal__empty px-5 py-10 text-center text-base text-subtle">
          {props.options.length === 0
            ? 'No component types available.'
            : 'No components match your search.'}
        </div>
      ) : (
        <div
          className={cn(
            'ComponentPickerModal__cards',
            grid
              ? 'grid grid-cols-2 gap-3 py-2 sm:grid-cols-3'
              : 'flex flex-col'
          )}
          ref={cardsContainerRef}
        >
          {filtered.map((opt, i) => (
            <ComponentPickerModal.Card
              key={opt.key}
              option={opt}
              layout={layout}
              focused={i === focusedIndex}
              onMouseEnter={() => setFocusedIndex(i)}
              onSelect={() => props.onSelect(opt)}
            />
          ))}
        </div>
      )}
      {showRemoveButton && (
        <DialogFooter>
          <div className="ComponentPickerModal__footer flex w-full justify-start">
            <Button
              variant="danger-subtle"
              icon={<IconTrash size={14} />}
              onClick={() => props.onRemove?.()}
            >
              Clear selection
            </Button>
          </div>
        </DialogFooter>
      )}
    </div>
  );
}

ComponentPickerModal.Card = (props: {
  option: ComponentPickerOption;
  layout: ComponentPickerLayout;
  focused?: boolean;
  onSelect: () => void;
  onMouseEnter?: () => void;
}) => {
  const {schema: s, preset} = props.option;
  const title = preset?.label || preset?.id || s.label || s.name;
  const description = preset?.description ?? s.description ?? '';
  const image = preset?.image || s.image;
  // Show the schema name as a small subtitle when displaying a preset, so the
  // editor can tell which component the preset belongs to.
  const subtitle = preset ? s.label || s.name : '';

  const grid = props.layout === 'grid';

  return (
    <button
      type="button"
      className={cn(
        'ComponentPickerModal__Card m-0 flex w-full cursor-pointer appearance-none items-stretch bg-transparent text-left font-sans text-inherit outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover',
        grid
          ? 'flex-col gap-2 rounded-sm border border-solid border-border p-2'
          : 'gap-3 border-0 border-t border-solid border-border py-3 pl-0 pr-2 first:border-t-0',
        props.focused && 'ComponentPickerModal__Card--focused bg-surface-hover'
      )}
      onClick={props.onSelect}
      onMouseEnter={props.onMouseEnter}
    >
      <div
        className={cn(
          'ComponentPickerModal__Card__image shrink-0 overflow-hidden border border-solid border-border',
          grid ? 'h-30 w-full' : 'h-22.5 w-30'
        )}
      >
        <FilePreview
          className={grid ? 'w-full!' : undefined}
          file={image}
          width={grid ? 180 : 120}
          height={grid ? 120 : 90}
          withPlaceholder={!image}
          alt={title}
        />
      </div>
      <div
        className={cn(
          'ComponentPickerModal__Card__content flex min-w-0 flex-1 flex-col gap-1',
          grid ? 'justify-start px-1 pb-1' : 'justify-center px-3'
        )}
      >
        {subtitle && (
          <div className="ComponentPickerModal__Card__content__subtitle text-xs font-medium uppercase tracking-wider text-muted">
            {subtitle}
          </div>
        )}
        <div
          className={cn(
            'ComponentPickerModal__Card__content__title font-semibold leading-snug',
            grid ? 'text-base' : 'text-xl'
          )}
        >
          {title}
        </div>
        {description && (
          <div className="ComponentPickerModal__Card__content__description line-clamp-2 text-sm leading-snug text-muted">
            {description}
          </div>
        )}
      </div>
    </button>
  );
};

ComponentPickerModal.id = COMPONENT_PICKER_MODAL_ID;
