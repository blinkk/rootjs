import {
  ActionIcon,
  Button,
  LoadingOverlay,
  Menu,
  MultiSelect,
  Select,
  Textarea,
  TextInput,
} from '@mantine/core';
import {useEffect, useReducer, useState} from 'preact/hooks';
import {
  IconCircleArrowDown,
  IconCircleArrowUp,
  IconCirclePlus,
  IconCopy,
  IconDotsVertical,
  IconPhotoUp,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTrash,
  IconTriangleFilled,
} from '@tabler/icons-preact';
import * as schema from '../../../core/schema.js';
import './DocumentEditor.css';
import {DraftController, SaveState, useDraft} from '../../hooks/useDraft.js';
import {flattenNestedKeys} from '../../utils/objects.js';
import {getPlaceholderKeys, strFormat} from '../../utils/str-format.js';

interface DocumentEditorProps {
  docId: string;
  collection: schema.Collection;
}

export function DocumentEditor(props: DocumentEditorProps) {
  const fields = props.collection.fields || [];
  const {loading, draft, saveState} = useDraft(props.docId);
  return (
    <div className="DocumentEditor">
      <LoadingOverlay
        visible={loading}
        loaderProps={{color: 'gray', size: 'xl'}}
      />
      <div className="DocumentEditor__saveState">
        {saveState === SaveState.SAVED && 'saved!'}
        {saveState === SaveState.SAVING && 'saving...'}
        {saveState === SaveState.UPDATES_PENDING && 'saving...'}
        {saveState === SaveState.ERROR && 'error saving'}
      </div>
      <div className="DocumentEditor__fields">
        {fields.map((field) => (
          <DocumentEditor.Field
            key={field.id}
            collection={props.collection}
            field={field}
            shallowKey={field.id!}
            deepKey={`fields.${field.id!}`}
            draft={draft}
          />
        ))}
      </div>
    </div>
  );
}

interface FieldProps {
  collection: schema.Collection;
  field: schema.Field;
  level?: number;
  hideHeader?: boolean;
  onChange?: (newValue: any) => void;
  shallowKey: string;
  deepKey: string;
  draft: DraftController;
}

DocumentEditor.Field = (props: FieldProps) => {
  const field = props.field;
  const level = props.level ?? 0;
  return (
    <div
      className="DocumentEditor__field"
      data-type={field.type}
      data-level={level}
      data-key={props.deepKey}
    >
      {!props.hideHeader && (
        <div className="DocumentEditor__field__header">
          <div className="DocumentEditor__field__name">
            {field.label || field.id}
          </div>
          {field.help && (
            <div className="DocumentEditor__field__help">{field.help}</div>
          )}
        </div>
      )}
      <div className="DocumentEditor__field__input">
        {field.type === 'array' ? (
          <DocumentEditor.ArrayField {...props} />
        ) : field.type === 'image' ? (
          <DocumentEditor.ImageField {...props} />
        ) : field.type === 'multiselect' ? (
          <DocumentEditor.MultiSelectField {...props} />
        ) : field.type === 'object' ? (
          <DocumentEditor.ObjectField {...props} />
        ) : field.type === 'oneof' ? (
          <DocumentEditor.OneOfField {...props} />
        ) : field.type === 'select' ? (
          <DocumentEditor.SelectField {...props} />
        ) : field.type === 'string' ? (
          <DocumentEditor.StringField {...props} />
        ) : (
          <div className="DocumentEditor__field__input__unknown">
            Unknown field type: {field.type}
          </div>
        )}
      </div>
    </div>
  );
};

DocumentEditor.StringField = (props: FieldProps) => {
  const field = props.field as schema.StringField;
  const [value, setValue] = useState('');

  function onChange(newValue: string) {
    setValue(newValue);
    props.draft.updateKey(props.deepKey, newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setValue(newValue);
      }
    );
    return unsubscribe;
  }, []);

  if (field.variant === 'textarea') {
    return (
      <Textarea
        size="xs"
        radius={0}
        autosize
        minRows={2}
        maxRows={20}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  return (
    <TextInput
      size="xs"
      radius={0}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
};

DocumentEditor.ImageField = (props: FieldProps) => {
  const field = props.field as schema.ImageField;
  return (
    <div className="DocumentEditor__ImageField">
      {/* <Button color="dark" size="xs" leftIcon={<IconPhotoUp size={16} />}>
        Upload image
      </Button> */}
      <Button color="dark" size="xs" leftIcon={<IconPhotoUp size={16} />}>
        Upload image
      </Button>
    </div>
  );
};

DocumentEditor.ObjectField = (props: FieldProps) => {
  const field = props.field as schema.ObjectField;
  return (
    <div className="DocumentEditor__ObjectField">
      <div className="DocumentEditor__ObjectField__fields">
        {field.fields.map((field) => (
          <DocumentEditor.Field
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
}

interface ArrayUpdate {
  type: 'update';
  newValue: ArrayFieldValue;
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
  | ArrayAdd
  | ArrayInsertBefore
  | ArrayInsertAfter
  | ArrayDuplicate
  | ArrayMoveUp
  | ArrayMoveDown
  | ArrayRemoveAt;

function arrayReducer(state: ArrayFieldValue, action: ArrayAction) {
  console.log(action);
  switch (action.type) {
    case 'update': {
      return {...action.newValue};
    }
    case 'add': {
      const data = state ?? {};
      const newKey = autokey();
      const order = [...(data._array || []), newKey];
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: {},
      });
      return {
        ...data,
        [newKey]: {},
        _array: order,
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
      return {
        ...data,
        [newKey]: {},
        _array: order,
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
      return {
        ...data,
        [newKey]: {},
        _array: order,
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
      return {
        ...data,
        [newKey]: clonedValue,
        _array: order,
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

DocumentEditor.ArrayField = (props: FieldProps) => {
  const draft = props.draft;
  const field = props.field as schema.ArrayField;
  const [value, dispatch] = useReducer(arrayReducer, {_array: []});

  const data = value ?? {};
  const order = data._array || [];

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: ArrayFieldValue) => {
        console.log('onRemoteChange()', newValue);
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

  return (
    <div className="DocumentEditor__ArrayField">
      <div className="DocumentEditor__ArrayField__items">
        {order.length === 0 && (
          <div className="DocumentEditor__ArrayField__items__empty">
            No items
          </div>
        )}
        {order.map((key: string, i: number) => (
          <details className="DocumentEditor__ArrayField__item" key={key} open>
            <summary className="DocumentEditor__ArrayField__item__header">
              <div className="DocumentEditor__ArrayField__item__header__icon">
                <IconTriangleFilled size={6} />
              </div>
              <div className="DocumentEditor__ArrayField__item__header__preview">
                {arrayPreview(field, value[key], i)}
              </div>
              <div className="DocumentEditor__ArrayField__item__header__controls">
                <div className="DocumentEditor__ArrayField__item__header__controls__arrows">
                  <button
                    className="DocumentEditor__ArrayField__item__header__controls__arrow DocumentEditor__ArrayField__item__header__controls__arrows--up"
                    onClick={() => moveUp(i)}
                  >
                    <IconCircleArrowUp size={20} strokeWidth={1.75} />
                  </button>
                  <button
                    className="DocumentEditor__ArrayField__item__header__controls__arrow DocumentEditor__ArrayField__item__header__controls__arrows--down"
                    onClick={() => moveDown(i)}
                  >
                    <IconCircleArrowDown size={20} strokeWidth={1.75} />
                  </button>
                </div>
                <Menu
                  className="DocumentEditor__ArrayField__item__header__controls__menu"
                  position="bottom"
                  control={
                    <ActionIcon className="DocumentEditor__ArrayField__item__header__controls__dots">
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
            <div className="DocumentEditor__ArrayField__item__body">
              <DocumentEditor.Field
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
      <div className="DocumentEditor__ArrayField__add">
        <Button
          color="dark"
          size="xs"
          leftIcon={<IconCirclePlus size={16} />}
          onClick={() => add()}
        >
          Add
        </Button>
      </div>
    </div>
  );
};

DocumentEditor.OneOfField = (props: FieldProps) => {
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

  function onTypeChange(newType: string) {
    props.draft.updateKey(`${props.deepKey}._type`, newType);
    setType(newType);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      `${props.deepKey}._type`,
      (newValue: string) => {
        setType(newValue || '');
      }
    );
    return unsubscribe;
  }, []);

  return (
    <div className="DocumentEditor__OneOfField">
      <div className="DocumentEditor__OneOfField__select">
        <div className="DocumentEditor__OneOfField__select__label">Type:</div>
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
        <div className="DocumentEditor__OneOfField__fields">
          {selectedType.fields.map((field) => (
            <DocumentEditor.Field
              key={field.id}
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

DocumentEditor.SelectField = (props: FieldProps) => {
  const field = props.field as schema.SelectField;
  const [value, setValue] = useState('');

  const options = (field.options || []).map((option) => {
    // Mantine requires both label and value to be set.
    if (typeof option === 'string') {
      return {label: option, value: option};
    }
    return {
      label: option.label ?? option.value ?? '',
      value: option.value ?? option.label ?? '',
    };
  });

  function onChange(newValue: string) {
    props.draft.updateKey(`${props.deepKey}`, newValue);
    setValue(newValue || '');
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setValue(newValue || '');
      }
    );
    return unsubscribe;
  }, []);

  return (
    <div className="DocumentEditor__SelectField">
      <Select
        data={options}
        placeholder={field.placeholder}
        value={value}
        onChange={(e: string) => onChange(e || '')}
        size="xs"
        radius={0}
        // Due to issues with preact/compat, use a div for the dropdown el.
        dropdownComponent="div"
      />
    </div>
  );
};

DocumentEditor.MultiSelectField = (props: FieldProps) => {
  const field = props.field as schema.MultiSelectField;
  const [value, setValue] = useState<string[]>([]);

  const options = (field.options || []).map((option) => {
    // Mantine requires both label and value to be set.
    if (typeof option === 'string') {
      return {label: option, value: option};
    }
    return {
      label: option.label ?? option.value ?? '',
      value: option.value ?? option.label ?? '',
    };
  });

  function onChange(newValue: string[]) {
    props.draft.updateKey(props.deepKey, newValue || []);
    setValue(newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string[]) => {
        setValue(newValue || []);
      }
    );
    return unsubscribe;
  }, []);

  return (
    <div className="DocumentEditor__MultiSelectField">
      <MultiSelect
        data={options}
        size="xs"
        radius={0}
        placeholder={field.placeholder}
        value={value}
        searchable
        creatable={field.creatable || false}
        getCreateLabel={(query: string) => `+ Add "${query}"`}
        onChange={(newValue: string[]) => onChange(newValue)}
        // Due to issues with preact/compat, use a div for the dropdown el.
        dropdownComponent="div"
      />
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
  console.log(placeholders);
  while (templates.length > 0) {
    const template = templates.shift()!;
    const preview = strFormat(template, placeholders);
    if (getPlaceholderKeys(preview).length === 0) {
      return preview;
    }
  }

  return `item ${index}`;
}

function autokey() {
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsLength = chars.length;
  for (let i = 0; i < 6; i++) {
    result.push(chars.charAt(Math.floor(Math.random() * charsLength)));
  }
  return result.join('');
}
