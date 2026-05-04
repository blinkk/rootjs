import './ComponentPickerModal.css';

import {Button, Image, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {IconSearch, IconTrash} from '@tabler/icons-preact';
import {useMemo, useState} from 'preact/hooks';

import * as schema from '../../../core/schema.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';

const MODAL_ID = 'ComponentPickerModal';

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

  const showRemoveButton = !!props.onRemove && !searchQuery.trim();

  return (
    <div className="ComponentPickerModal">
      <div className="ComponentPickerModal__controls">
        <TextInput
          placeholder={props.searchPlaceholder || 'Search components...'}
          value={searchQuery}
          onChange={(e: any) => setSearchQuery(e.target.value)}
          icon={<IconSearch size={16} />}
          size="xs"
          autoFocus
          className="ComponentPickerModal__controls__search"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="ComponentPickerModal__empty">
          {props.options.length === 0
            ? 'No component types available.'
            : 'No components match your search.'}
        </div>
      ) : (
        <div className="ComponentPickerModal__cards">
          {filtered.map((opt) => (
            <ComponentPickerModal.Card
              key={opt.key}
              option={opt}
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
  onSelect: () => void;
}) => {
  const {schema: s, preset} = props.option;
  const title = preset?.label || preset?.id || s.label || s.name;
  const description = preset?.description ?? s.description ?? '';
  const image = preset?.image || s.image;
  // Show the schema name as a small subtitle when displaying a preset, so the
  // editor can tell which component the preset belongs to.
  const subtitle = preset ? s.label || s.name : '';

  return (
    <button
      type="button"
      className="ComponentPickerModal__Card"
      onClick={props.onSelect}
    >
      <div className="ComponentPickerModal__Card__image">
        <Image
          src={image}
          width={120}
          height={90}
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
