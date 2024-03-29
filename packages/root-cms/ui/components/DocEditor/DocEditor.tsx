import {ActionIcon, Button, LoadingOverlay, Menu, Select} from '@mantine/core';
import {
  IconBraces,
  IconCircleArrowDown,
  IconCircleArrowUp,
  IconCirclePlus,
  IconCopy,
  IconDotsVertical,
  IconPlanet,
  IconRocket,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTrash,
  IconTriangleFilled,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useReducer, useState} from 'preact/hooks';
import {route} from 'preact-router';

import * as schema from '../../../core/schema.js';
import {
  DraftController,
  SaveState,
  UseDraftHook,
} from '../../hooks/useDraft.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDefaultFieldValue} from '../../utils/fields.js';
import {flattenNestedKeys} from '../../utils/objects.js';
import {autokey} from '../../utils/rand.js';
import {getPlaceholderKeys, strFormat} from '../../utils/str-format.js';
import {
  DocActionEvent,
  DocActionsMenu,
} from '../DocActionsMenu/DocActionsMenu.js';
import {DocStatusBadges} from '../DocStatusBadges/DocStatusBadges.js';
import {useEditJsonModal} from '../EditJsonModal/EditJsonModal.js';
import {useLocalizationModal} from '../LocalizationModal/LocalizationModal.js';
import {usePublishDocModal} from '../PublishDocModal/PublishDocModal.js';
import './DocEditor.css';
import {Viewers} from '../Viewers/Viewers.js';
import {BooleanField} from './fields/BooleanField.js';
import {DateTimeField} from './fields/DateTimeField.js';
import {FieldProps} from './fields/FieldProps.js';
import {FileField} from './fields/FileField.js';
import {ImageField} from './fields/ImageField.js';
import {MultiSelectField} from './fields/MultiSelectField.js';
import {ReferenceField} from './fields/ReferenceField.js';
import {RichTextField} from './fields/RichTextField.js';
import {SelectField} from './fields/SelectField.js';
import {StringField} from './fields/StringField.js';

interface DocEditorProps {
  docId: string;
  collection: schema.Collection;
  draft: UseDraftHook;
}

export function DocEditor(props: DocEditorProps) {
  const fields = props.collection.fields || [];
  const {loading, controller, saveState, data} = props.draft;

  function goBack() {
    const collectionId = props.docId.split('/')[0];
    route(`/cms/content/${collectionId}`);
  }

  function onDocAction(event: DocActionEvent) {
    if (event.action === 'delete') {
      goBack();
    }
  }

  const publishDocModal = usePublishDocModal({docId: props.docId});
  const localizationModal = useLocalizationModal({
    docId: props.docId,
    draft: controller,
    collection: props.collection,
  });

  return (
    <>
      <div className="DocEditor">
        <LoadingOverlay
          visible={loading}
          loaderProps={{color: 'gray', size: 'xl'}}
        />
        <div className="DocEditor__statusBar">
          <div className="DocEditor__statusBar__viewers">
            <Viewers id={`doc/${props.docId}`} />
          </div>
          <div className="DocEditor__statusBar__saveState">
            {saveState === SaveState.SAVED && 'saved!'}
            {saveState === SaveState.SAVING && 'saving...'}
            {saveState === SaveState.UPDATES_PENDING && 'saving...'}
            {saveState === SaveState.ERROR && 'error saving'}
          </div>
          {!loading && data?.sys && (
            <div className="DocEditor__statusBar__statusBadges">
              <DocStatusBadges doc={data} />
            </div>
          )}
          <div className="DocEditor__statusBar__i18n">
            <Button
              variant="default"
              color="dark"
              size="xs"
              leftIcon={<IconPlanet size={16} />}
              onClick={() => localizationModal.open()}
            >
              Localization
            </Button>
          </div>
          <div className="DocEditor__statusBar__publishButton">
            <Button
              color="dark"
              size="xs"
              leftIcon={<IconRocket size={16} />}
              onClick={() => publishDocModal.open()}
            >
              Publish
            </Button>
          </div>
          <div className="DocEditor__statusBar__actionsMenu">
            <DocActionsMenu
              docId={props.docId}
              data={data}
              onAction={onDocAction}
            />
          </div>
        </div>
        <div className="DocEditor__fields">
          {fields.map((field) => (
            <DocEditor.Field
              key={field.id}
              collection={props.collection}
              field={field}
              shallowKey={field.id!}
              deepKey={`fields.${field.id!}`}
              draft={controller}
            />
          ))}
        </div>
      </div>
    </>
  );
}

DocEditor.Field = (props: FieldProps) => {
  const field = props.field;
  const level = props.level ?? 0;
  return (
    <div
      className={joinClassNames(
        'DocEditor__field',
        field.deprecated && 'DocEditor__field--deprecated'
      )}
      data-type={field.type}
      data-level={level}
      data-key={props.deepKey}
    >
      {!props.hideHeader && (
        <div className="DocEditor__field__header">
          {field.deprecated ? (
            <div className="DocEditor__field__name">
              DEPRECATED: {field.label || field.id}
            </div>
          ) : (
            <div className="DocEditor__field__name">
              {field.label || field.id}
            </div>
          )}
          {field.help && (
            <div className="DocEditor__field__help">{field.help}</div>
          )}
        </div>
      )}
      <div className="DocEditor__field__input">
        {field.type === 'array' ? (
          <DocEditor.ArrayField {...props} />
        ) : field.type === 'boolean' ? (
          <BooleanField {...props} />
        ) : field.type === 'datetime' ? (
          <DateTimeField {...props} />
        ) : field.type === 'file' ? (
          <FileField {...props} />
        ) : field.type === 'image' ? (
          <ImageField {...props} />
        ) : field.type === 'multiselect' ? (
          <MultiSelectField {...props} />
        ) : field.type === 'object' ? (
          <DocEditor.ObjectField {...props} />
        ) : field.type === 'oneof' ? (
          <DocEditor.OneOfField {...props} />
        ) : field.type === 'reference' ? (
          <ReferenceField {...props} />
        ) : field.type === 'richtext' ? (
          <RichTextField {...props} />
        ) : field.type === 'select' ? (
          <SelectField {...props} />
        ) : field.type === 'string' ? (
          <StringField {...props} />
        ) : (
          <div className="DocEditor__field__input__unknown">
            Unknown field type: {field.type}
          </div>
        )}
      </div>
    </div>
  );
};

DocEditor.ObjectField = (props: FieldProps) => {
  const field = props.field as schema.ObjectField;
  return (
    <div className="DocEditor__ObjectField">
      <div className="DocEditor__ObjectField__fields">
        {field.fields.map((field) => (
          <DocEditor.Field
            key={field.id}
            collection={props.collection}
            field={field}
            shallowKey={field.id!}
            deepKey={`${props.deepKey}.${field.id}`}
            draft={props.draft}
          />
        ))}
      </div>
    </div>
  );
};

interface ArrayFieldValue {
  [key: string]: any;
  _array: string[];
  _new?: string[];
}

interface ArrayUpdate {
  type: 'update';
  newValue: ArrayFieldValue;
}

interface ArrayUpdateItem {
  type: 'updateItem';
  index: number;
  newValue: ArrayFieldValue;
  draft: DraftController;
  deepKey: string;
}

interface ArrayAdd {
  type: 'add';
  draft: DraftController;
  deepKey: string;
}

interface ArrayInsertBefore {
  type: 'insertBefore';
  index: number;
  draft: DraftController;
  deepKey: string;
}

interface ArrayInsertAfter {
  type: 'insertAfter';
  index: number;
  draft: DraftController;
  deepKey: string;
}

interface ArrayDuplicate {
  type: 'duplicate';
  index: number;
  draft: DraftController;
  deepKey: string;
}

interface ArrayMoveUp {
  type: 'moveUp';
  index: number;
  draft: DraftController;
  deepKey: string;
}

interface ArrayMoveDown {
  type: 'moveDown';
  index: number;
  draft: DraftController;
  deepKey: string;
}

interface ArrayRemoveAt {
  type: 'removeAt';
  index: number;
  draft: DraftController;
  deepKey: string;
}

type ArrayAction =
  | ArrayUpdate
  | ArrayUpdateItem
  | ArrayAdd
  | ArrayInsertBefore
  | ArrayInsertAfter
  | ArrayDuplicate
  | ArrayMoveUp
  | ArrayMoveDown
  | ArrayRemoveAt;

function arrayReducer(state: ArrayFieldValue, action: ArrayAction) {
  switch (action.type) {
    case 'update': {
      const newlyAdded = state._new || [];
      return {...action.newValue, _new: newlyAdded};
    }
    case 'updateItem': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const key = order[action.index];
      const newValue = action.newValue ?? {};
      action.draft.updateKey(`${action.deepKey}.${key}`, newValue);
      return {
        ...data,
        [key]: newValue,
      };
    }
    case 'add': {
      const data = state ?? {};
      const newKey = autokey();
      const order = [...(data._array || []), newKey];
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: {},
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: {},
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'insertBefore': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      order.splice(action.index, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: {},
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: {},
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'insertAfter': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      order.splice(action.index + 1, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: {},
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: {},
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'duplicate': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const ogKey = order[action.index];
      const clonedValue = structuredClone(data[ogKey]);
      const newKey = autokey();
      order.splice(action.index + 1, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: clonedValue,
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: clonedValue,
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'moveUp': {
      if (action.index === 0) {
        return state;
      }
      const data = state ?? {};
      const order = [...(data._array || [])];
      arraySwap(order, action.index, action.index - 1);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
      });
      return {
        ...data,
        _array: order,
      };
    }
    case 'moveDown': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      if (action.index >= order.length - 1) {
        return state;
      }
      arraySwap(order, action.index, action.index + 1);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
      });
      return {
        ...data,
        _array: order,
      };
    }
    case 'removeAt': {
      const data = {...(state ?? {})};
      const order = data._array || [];
      const newOrder = [...order];
      const oldKey = newOrder[action.index];
      delete data[oldKey];
      newOrder.splice(action.index, 1);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: newOrder,
      });
      action.draft.removeKey(`${action.deepKey}.${oldKey}`);
      return {
        ...data,
        _array: newOrder,
      };
    }
    default: {
      console.error('unknown action', action);
      return state;
    }
  }
}

DocEditor.ArrayField = (props: FieldProps) => {
  const draft = props.draft;
  const field = props.field as schema.ArrayField;
  const [value, dispatch] = useReducer(arrayReducer, {_array: []});

  const data = value ?? {};
  const order = data._array || [];

  // Keep track of newly-added keys, which should start in the "open" state.
  const newlyAdded = value._new || [];

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: ArrayFieldValue) => {
        dispatch({type: 'update', newValue});
      }
    );
    return unsubscribe;
  }, []);

  const add = () => {
    dispatch({type: 'add', draft: draft, deepKey: props.deepKey});
  };

  const insertBefore = (index: number) => {
    dispatch({
      type: 'insertBefore',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
    });
  };

  const insertAfter = (index: number) => {
    dispatch({
      type: 'insertAfter',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
    });
  };

  const duplicate = (index: number) => {
    dispatch({
      type: 'duplicate',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
    });
  };

  const removeAt = (index: number) => {
    dispatch({
      type: 'removeAt',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
    });
  };

  const moveUp = (index: number) => {
    dispatch({
      type: 'moveUp',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
    });
  };

  const moveDown = (index: number) => {
    dispatch({
      type: 'moveDown',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
    });
  };

  const editJsonModal = useEditJsonModal();

  const editJson = (index: number) => {
    const key = order[index];
    editJsonModal.open({
      data: value[key],
      onSave: (newValue) => {
        console.log('editJson, onSave():', newValue);
        dispatch({
          type: 'updateItem',
          draft,
          index,
          newValue,
          deepKey: props.deepKey,
        });
        draft.notifySubscribers();
        editJsonModal.close();
      },
    });
  };

  return (
    <div className="DocEditor__ArrayField">
      <div className="DocEditor__ArrayField__items">
        {order.length === 0 && (
          <div className="DocEditor__ArrayField__items__empty">No items</div>
        )}
        {order.map((key: string, i: number) => (
          <details
            className="DocEditor__ArrayField__item"
            key={key}
            open={newlyAdded.includes(key)}
          >
            <summary className="DocEditor__ArrayField__item__header">
              <div className="DocEditor__ArrayField__item__header__icon">
                <IconTriangleFilled size={6} />
              </div>
              <div className="DocEditor__ArrayField__item__header__preview">
                {arrayPreview(field, value[key], i)}
              </div>
              <div className="DocEditor__ArrayField__item__header__controls">
                <div className="DocEditor__ArrayField__item__header__controls__arrows">
                  <button
                    className="DocEditor__ArrayField__item__header__controls__arrow DocEditor__ArrayField__item__header__controls__arrows--up"
                    onClick={() => moveUp(i)}
                  >
                    <IconCircleArrowUp size={20} strokeWidth={1.75} />
                  </button>
                  <button
                    className="DocEditor__ArrayField__item__header__controls__arrow DocEditor__ArrayField__item__header__controls__arrows--down"
                    onClick={() => moveDown(i)}
                  >
                    <IconCircleArrowDown size={20} strokeWidth={1.75} />
                  </button>
                </div>
                <Menu
                  className="DocEditor__ArrayField__item__header__controls__menu"
                  position="bottom"
                  control={
                    <ActionIcon className="DocEditor__ArrayField__item__header__controls__dots">
                      <IconDotsVertical size={16} />
                    </ActionIcon>
                  }
                >
                  <Menu.Label>INSERT</Menu.Label>
                  <Menu.Item
                    icon={<IconRowInsertTop size={20} />}
                    onClick={() => insertBefore(i)}
                  >
                    Add before
                  </Menu.Item>
                  <Menu.Item
                    icon={<IconRowInsertBottom size={20} />}
                    onClick={() => insertAfter(i)}
                  >
                    Add after
                  </Menu.Item>
                  <Menu.Item
                    icon={<IconCopy size={20} />}
                    onClick={() => duplicate(i)}
                  >
                    Duplicate
                  </Menu.Item>

                  <Menu.Label>CODE</Menu.Label>
                  <Menu.Item
                    icon={<IconBraces size={20} />}
                    onClick={() => editJson(i)}
                  >
                    Edit JSON
                  </Menu.Item>

                  <Menu.Label>REMOVE</Menu.Label>
                  <Menu.Item
                    icon={<IconTrash size={20} />}
                    onClick={() => removeAt(i)}
                  >
                    Remove
                  </Menu.Item>
                </Menu>
              </div>
            </summary>
            <div className="DocEditor__ArrayField__item__body">
              <DocEditor.Field
                key={`${props.deepKey}.${key}`}
                collection={props.collection}
                field={field.of}
                shallowKey={field.id!}
                deepKey={`${props.deepKey}.${key}`}
                draft={props.draft}
                hideHeader
              />
            </div>
          </details>
        ))}
      </div>
      <div className="DocEditor__ArrayField__add">
        <Button
          color="dark"
          size="xs"
          leftIcon={<IconCirclePlus size={16} />}
          onClick={() => add()}
        >
          {field.buttonLabel || 'Add'}
        </Button>
      </div>
    </div>
  );
};

DocEditor.OneOfField = (props: FieldProps) => {
  const field = props.field as schema.OneOfField;
  const [type, setType] = useState('');
  const typesMap: Record<string, schema.Schema> = {};
  const dropdownValues: Array<{value: string; label: string}> = [
    {value: '', label: field.placeholder || 'Select type'},
  ];
  field.types.forEach((type) => {
    typesMap[type.name] = type;
    dropdownValues.push({value: type.name, label: type.name});
  });
  const selectedType = typesMap[type || ''];

  const cachedValues = useMemo<any>(() => {
    return {};
  }, []);

  async function onTypeChange(newType: string) {
    const newValue: any = {};
    if (newType) {
      if (newType in cachedValues) {
        // When swapping to a previously selected type, reset to the previous
        // value.
        const cachedValue = cachedValues[newType];
        Object.assign(newValue, cachedValue);
      } else if (newType in typesMap) {
        const defaultValue = getDefaultFieldValue(typesMap[newType]);
        Object.assign(newValue, defaultValue);
      }
    }
    newValue._type = newType;

    await props.draft.updateKey(props.deepKey, newValue);
    setType(newType);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: any) => {
        if (newValue?._type) {
          setType(newValue._type || '');
          cachedValues[newValue._type] = newValue;
        }
      }
    );
    return unsubscribe;
  }, []);

  return (
    <div className="DocEditor__OneOfField">
      <div className="DocEditor__OneOfField__select">
        <div className="DocEditor__OneOfField__select__label">Type:</div>
        <Select
          data={dropdownValues}
          value={type}
          placeholder={field.placeholder}
          onChange={(e: string) => onTypeChange(e || '')}
          size="xs"
          radius={0}
          // Due to issues with preact/compat, use a div for the dropdown el.
          dropdownComponent="div"
        />
      </div>
      {selectedType && (
        <div className="DocEditor__OneOfField__fields">
          {selectedType.fields.map((field) => (
            <DocEditor.Field
              key={`${type}::${field.id}`}
              collection={props.collection}
              field={field}
              shallowKey={field.id!}
              deepKey={`${props.deepKey}.${field.id!}`}
              draft={props.draft}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function arraySwap<T = unknown>(arr: T[], index1: number, index2: number) {
  if (arr.length <= 1) {
    return arr;
  }
  const tmp = arr[index1];
  arr[index1] = arr[index2];
  arr[index2] = tmp;
  return arr;
}

function arrayPreview(
  field: schema.ArrayField,
  data: any,
  index: number
): string {
  if (!field.preview) {
    return `item ${index}`;
  }

  const templates = Array.isArray(field.preview)
    ? [...field.preview]
    : [field.preview];
  const placeholders = flattenNestedKeys(data);
  placeholders._index = String(index);
  placeholders['_index:02'] = placeholders._index.padStart(2, '0');
  placeholders['_index:03'] = placeholders._index.padStart(3, '0');
  while (templates.length > 0) {
    const template = templates.shift()!;
    const preview = strFormat(template, placeholders);
    if (getPlaceholderKeys(preview).length === 0) {
      return preview;
    }
  }

  return `item ${index}`;
}
