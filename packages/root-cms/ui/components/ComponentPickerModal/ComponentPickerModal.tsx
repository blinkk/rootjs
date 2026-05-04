import './ComponentPickerModal.css';

import {Button, Image, SegmentedControl, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {
  IconLayoutGrid,
  IconLayoutList,
  IconSearch,
  IconTrash,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';

import * as schema from '../../../core/schema.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';

const MODAL_ID = 'ComponentPickerModal';
const LAYOUT_STORAGE_KEY = 'root::ComponentPickerModal:layout';
const GRID_COLUMNS = 3;

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
   * Optional handler invoked when the user clicks the "Remove component"
   * button in the footer. When omitted, the button is not rendered. The
   * button is also hidden while the user has an active search query. The
   * caller is responsible for closing the modal.
   */
  onRemove?: () => void;
}

export function useComponentPickerModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: ComponentPickerModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: '720px',
        overflow: 'inside',
        title: 'Select a component',
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
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

  function handleKeyDown(e: KeyboardEvent) {
    if (filtered.length === 0) {
      return;
    }
    const cols = layout === 'grid' ? GRID_COLUMNS : 1;
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
  const layoutClass =
    layout === 'grid'
      ? 'ComponentPickerModal--grid'
      : 'ComponentPickerModal--list';

  return (
    <div
      className={`ComponentPickerModal ${layoutClass}`}
      onKeyDown={handleKeyDown}
    >
      <div className="ComponentPickerModal__controls">
        <TextInput
          // `data-autofocus` cooperates with Mantine's modal focus trap, which
          // runs in setTimeout(0) and would otherwise override any imperative
          // focus call we made on mount.
          data-autofocus
          placeholder={props.searchPlaceholder || 'Search components...'}
          value={searchQuery}
          onChange={(e: any) => setSearchQuery(e.target.value)}
          icon={<IconSearch size={16} />}
          size="xs"
          className="ComponentPickerModal__controls__search"
        />
        <SegmentedControl
          className="ComponentPickerModal__controls__layout"
          size="xs"
          value={layout}
          onChange={(value: ComponentPickerLayout) => setLayout(value)}
          data={[
            {
              value: 'list',
              label: (
                <span
                  className="ComponentPickerModal__controls__layout__option"
                  aria-label="List layout"
                  title="List layout"
                >
                  <IconLayoutList size={14} />
                </span>
              ),
            },
            {
              value: 'grid',
              label: (
                <span
                  className="ComponentPickerModal__controls__layout__option"
                  aria-label="Grid layout"
                  title="Grid layout"
                >
                  <IconLayoutGrid size={14} />
                </span>
              ),
            },
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="ComponentPickerModal__empty">
          {props.options.length === 0
            ? 'No component types available.'
            : 'No components match your search.'}
        </div>
      ) : (
        <div className="ComponentPickerModal__cards" ref={cardsContainerRef}>
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
        <div className="ComponentPickerModal__footer">
          <Button
            variant="subtle"
            color="red"
            size="xs"
            leftIcon={<IconTrash size={14} />}
            onClick={() => props.onRemove?.()}
          >
            Remove component
          </Button>
        </div>
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

  const dim = props.layout === 'grid' ? 180 : 120;
  const imgWidth = dim;
  const imgHeight = props.layout === 'grid' ? 120 : 90;

  const className = [
    'ComponentPickerModal__Card',
    props.focused ? 'ComponentPickerModal__Card--focused' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={props.onSelect}
      onMouseEnter={props.onMouseEnter}
    >
      <div className="ComponentPickerModal__Card__image">
        <Image
          src={image}
          width={imgWidth}
          height={imgHeight}
          withPlaceholder={!image}
          alt={title}
        />
      </div>
      <div className="ComponentPickerModal__Card__content">
        {subtitle && (
          <div className="ComponentPickerModal__Card__content__subtitle">
            {subtitle}
          </div>
        )}
        <div className="ComponentPickerModal__Card__content__title">
          {title}
        </div>
        {description && (
          <div className="ComponentPickerModal__Card__content__description">
            {description}
          </div>
        )}
      </div>
    </button>
  );
};

ComponentPickerModal.id = MODAL_ID;
