import {
  ActionIcon,
  Button,
  Menu,
  Select,
  Textarea,
  TextInput,
} from '@mantine/core';
import {useCallback, useState} from 'preact/hooks';
import {
  IconArrowDownCircle,
  IconArrowUpCircle,
  IconCircleChevronLeft,
  IconCircleChevronRight,
  IconCirclePlus,
  IconCopy,
  IconDotsVertical,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTrash,
  IconTriangleFilled,
} from '@tabler/icons-preact';
import * as schema from '../../../core/schema.js';
import './DocumentEditor.css';

interface DocumentEditorProps {
  collection: schema.Collection;
}

export function DocumentEditor(props: DocumentEditorProps) {
  const fields = props.collection.fields || [];
  return (
    <div className="DocumentEditor">
      <div className="DocumentEditor__fields">
        {fields.map((field) => (
          <DocumentEditor.Field
            key={field.id}
            collection={props.collection}
            field={field}
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
}

DocumentEditor.Field = (props: FieldProps) => {
  const field = props.field;
  const level = props.level || 0;
  return (
    <div
      className="DocumentEditor__field"
      data-type={field.type}
      data-level={level}
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
        ) : field.type === 'object' ? (
          <DocumentEditor.ObjectField {...props} />
        ) : field.type === 'oneof' ? (
          <DocumentEditor.OneOfField {...props} />
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
  if (field.variant === 'textarea') {
    return <Textarea size="xs" radius={0} autosize minRows={2} maxRows={20} />;
  }
  return <TextInput size="xs" radius={0} />;
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
          />
        ))}
      </div>
    </div>
  );
};

DocumentEditor.ArrayField = (props: FieldProps) => {
  const field = props.field as schema.ArrayField;
  const [values, setValues] = useState<any[]>([]);

  const add = useCallback(() => {
    setValues((current) => {
      return [...current, {_key: autokey()}];
    });
  }, []);

  const insertBefore = useCallback((index: number) => {
    setValues((current) => {
      const newItem = {_key: autokey()};
      const newValue = [...current];
      newValue.splice(index, 0, newItem);
      return newValue;
    });
  }, []);

  const insertAfter = useCallback((index: number) => {
    setValues((current) => {
      const newItem = {_key: autokey()};
      const newValue = [...current];
      newValue.splice(index + 1, 0, newItem);
      return newValue;
    });
  }, []);

  const duplicate = useCallback((index: number) => {
    setValues((current) => {
      const newItem = structuredClone(current[index]);
      newItem._key = autokey();
      const newValue = [...current];
      newValue.splice(index + 1, 0, newItem);
      return newValue;
    });
  }, []);

  const removeAt = useCallback((index: number) => {
    setValues((current) => {
      const newValue = [...current];
      newValue.splice(index, 1);
      return newValue;
    });
  }, []);

  const moveUp = useCallback((index: number) => {
    setValues((current) => {
      if (index === 0) {
        return current;
      }
      const newValue = [...current];
      return arraySwap(newValue, index, index - 1);
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setValues((current) => {
      if (index >= current.length - 1) {
        return current;
      }
      const newValue = [...current];
      return arraySwap(newValue, index, index + 1);
    });
  }, []);

  return (
    <div className="DocumentEditor__ArrayField">
      <div className="DocumentEditor__ArrayField__items">
        {values.length === 0 && (
          <div className="DocumentEditor__ArrayField__items__empty">
            No items
          </div>
        )}
        {values.map((value, i) => (
          <details
            className="DocumentEditor__ArrayField__item"
            key={value._key}
            open
          >
            <summary className="DocumentEditor__ArrayField__item__header">
              <div className="DocumentEditor__ArrayField__item__header__icon">
                <IconTriangleFilled size={8} />
              </div>
              <div className="DocumentEditor__ArrayField__item__header__preview">
                item {i}
              </div>
              <div className="DocumentEditor__ArrayField__item__header__controls">
                <div className="DocumentEditor__ArrayField__item__header__controls__arrows">
                  <button
                    className="DocumentEditor__ArrayField__item__header__controls__arrow DocumentEditor__ArrayField__item__header__controls__arrows--up"
                    onClick={() => moveUp(i)}
                  >
                    <IconArrowUpCircle size={20} strokeWidth={1.75} />
                  </button>
                  <button
                    className="DocumentEditor__ArrayField__item__header__controls__arrow DocumentEditor__ArrayField__item__header__controls__arrows--down"
                    onClick={() => moveDown(i)}
                  >
                    <IconArrowDownCircle size={20} strokeWidth={1.75} />
                  </button>
                </div>
                <Menu position="bottom-start" width={200}>
                  <Menu.Target>
                    <ActionIcon className="DocumentEditor__ArrayField__item__header__controls__dots">
                      <IconDotsVertical size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown className="DocumentEditor__ArrayField__item__header__controls__menu">
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
                  </Menu.Dropdown>
                </Menu>
              </div>
            </summary>
            <div className="DocumentEditor__ArrayField__item__body">
              <DocumentEditor.Field
                collection={props.collection}
                field={field.of}
                hideHeader
              />
            </div>
          </details>
        ))}
      </div>
      <div className="DocumentEditor__ArrayField__add">
        <Button color="dark" size="xs" onClick={() => add()}>
          Add
        </Button>
      </div>
    </div>
  );
};

DocumentEditor.OneOfField = (props: FieldProps) => {
  const [type, setType] = useState<string | null>(null);

  const field = props.field as schema.OneOfField;
  const typesMap: Record<string, schema.Schema> = {};
  const dropdownValues: Array<{value: string; label: string}> = [];
  field.types.forEach((type) => {
    typesMap[type.name] = type;
    dropdownValues.push({value: type.name, label: type.name});
  });

  const selectedType = typesMap[type || ''];

  return (
    <div className="DocumentEditor__OneOfField">
      <div className="DocumentEditor__OneOfField__select">
        <div className="DocumentEditor__OneOfField__select__label">Select:</div>
        <Select
          data={dropdownValues}
          size="xs"
          value={type}
          onChange={(e) => setType(e)}
        />
      </div>
      {selectedType && (
        <div className="DocumentEditor__OneOfField__fields">
          {selectedType.fields.map((field) => (
            <DocumentEditor.Field
              key={field.id}
              collection={props.collection}
              field={field}
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

function autokey() {
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsLength = chars.length;
  for (let i = 0; i < 12; i++) {
    result.push(chars.charAt(Math.floor(Math.random() * charsLength)));
  }
  return result.join('');
}
