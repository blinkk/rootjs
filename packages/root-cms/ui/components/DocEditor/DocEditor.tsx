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
import {useEffect, useReducer, useRef, useState} from 'preact/hooks';
import {
  IconCircleArrowDown,
  IconCircleArrowUp,
  IconCirclePlus,
  IconCopy,
  IconDotsVertical,
  IconPhotoUp,
  IconRocket,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTrash,
  IconTriangleFilled,
} from '@tabler/icons-preact';
import * as schema from '../../../core/schema.js';
import {DraftController, SaveState, useDraft} from '../../hooks/useDraft.js';
import {flattenNestedKeys} from '../../utils/objects.js';
import {getPlaceholderKeys, strFormat} from '../../utils/str-format.js';
import './DocEditor.css';
import {DocStatusBadges} from '../DocStatusBadges/DocStatusBadges.js';
import {PublishDocModal} from '../PublishDocModal/PublishDocModal.js';
import {DocActionsMenu} from '../DocActionsMenu/DocActionsMenu.js';
import {route} from 'preact-router';
import {ref as storageRef, updateMetadata, uploadBytes} from 'firebase/storage';

interface DocEditorProps {
  docId: string;
  collection: schema.Collection;
}

export function DocEditor(props: DocEditorProps) {
  const fields = props.collection.fields || [];
  const {loading, draft, saveState, data} = useDraft(props.docId);
  const [publishDocModalOpen, setPublishDocModalOpen] = useState(false);

  function goBack() {
    const collectionId = props.docId.split('/')[0];
    route(`/cms/content/${collectionId}`);
  }

  return (
    <>
      <PublishDocModal
        docId={props.docId}
        opened={publishDocModalOpen}
        onClose={() => setPublishDocModalOpen(false)}
      />
      <div className="DocEditor">
        <LoadingOverlay
          visible={loading}
          loaderProps={{color: 'gray', size: 'xl'}}
        />
        <div className="DocEditor__statusBar">
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
          <div className="DocEditor__statusBar__publishButton">
            <Button
              color="dark"
              size="xs"
              leftIcon={<IconRocket size={16} />}
              onClick={() => setPublishDocModalOpen(true)}
            >
              Publish
            </Button>
          </div>
          <div className="DocEditor__statusBar__actionsMenu">
            <DocActionsMenu docId={props.docId} onDelete={() => goBack()} />
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
              draft={draft}
            />
          ))}
        </div>
      </div>
    </>
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

DocEditor.Field = (props: FieldProps) => {
  const field = props.field;
  const level = props.level ?? 0;
  return (
    <div
      className="DocEditor__field"
      data-type={field.type}
      data-level={level}
      data-key={props.deepKey}
    >
      {!props.hideHeader && (
        <div className="DocEditor__field__header">
          <div className="DocEditor__field__name">
            {field.label || field.id}
          </div>
          {field.help && (
            <div className="DocEditor__field__help">{field.help}</div>
          )}
        </div>
      )}
      <div className="DocEditor__field__input">
        {field.type === 'array' ? (
          <DocEditor.ArrayField {...props} />
        ) : field.type === 'image' ? (
          <DocEditor.ImageField {...props} />
        ) : field.type === 'multiselect' ? (
          <DocEditor.MultiSelectField {...props} />
        ) : field.type === 'object' ? (
          <DocEditor.ObjectField {...props} />
        ) : field.type === 'oneof' ? (
          <DocEditor.OneOfField {...props} />
        ) : field.type === 'select' ? (
          <DocEditor.SelectField {...props} />
        ) : field.type === 'string' ? (
          <DocEditor.StringField {...props} />
        ) : (
          <div className="DocEditor__field__input__unknown">
            Unknown field type: {field.type}
          </div>
        )}
      </div>
    </div>
  );
};

DocEditor.StringField = (props: FieldProps) => {
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

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

async function uploadFileToGCS(file: File) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const hashHex = await sha256(file);
  const ext = file.name.split('.').at(-1);
  const filePath = `${projectId}/uploads/${hashHex}.${ext}`;
  const gcsRef = storageRef(window.firebase.storage, filePath);
  await uploadBytes(gcsRef, file);
  console.log(`uploaded ${filePath}`);
  const meta: Record<string, string> = {};
  meta.filename = file.name;
  meta.uploadedBy = window.firebase.user.email || 'unknown';
  if (ext === 'jpg' || ext === 'png') {
    const dimens = await getImageDimensions(file);
    meta.width = String(dimens.width);
    meta.height = String(dimens.height);

    const gcsPath = `/${gcsRef.bucket}/${gcsRef.fullPath}`;
    const gciUrl = await getGciUrl(gcsPath);
    meta.gciUrl = gciUrl;
  }
  if (Object.keys(meta).length > 0) {
    await updateMetadata(gcsRef, {customMetadata: meta});
    console.log('updated meta data: ', meta);
  }
  return {
    ...meta,
    src: `https://storage.googleapis.com/${gcsRef.bucket}/${filePath}`,
  };
}

async function getGciUrl(gcsPath: string) {
  console.log(gcsPath);
  const params = new URLSearchParams({gcs: gcsPath});
  const url = `https://gci.rootjs.dev/_/serving_url?${params.toString()}`;
  const res = await window.fetch(url);
  if (res.status !== 200) {
    const text = await res.text();
    console.error(`failed to get gci url: ${url}`);
    console.error(text);
    throw new Error('failed to get gci url');
  }
  const resData = await res.json();
  return resData.servingUrl;
}

async function getImageDimensions(
  file: File
): Promise<{width: number; height: number}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        resolve({width: img.width, height: img.height});
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

DocEditor.ImageField = (props: FieldProps) => {
  const field = props.field as schema.ImageField;
  const [img, setImg] = useState<any>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setImg(newValue);
      }
    );
    return unsubscribe;
  }, []);

  async function onFileChange(e: Event) {
    setLoading(true);
    const inputEl = e.target as HTMLInputElement;
    const files = inputEl.files || [];
    const file = files[0];
    const img = await uploadFileToGCS(file);
    props.draft.updateKey(props.deepKey, img);
    setImg(img);
    setLoading(false);

    // Once the upload is done, reset the input element in case the user wishes
    // to re-upload the image.
    if (inputRef.current) {
      const inputEl = inputRef.current;
      inputEl.value = '';
    }
  }

  return (
    <div className="DocEditor__ImageField">
      {img && img.src ? (
        <div className="DocEditor__ImageField__imagePreview">
          <div className="DocEditor__ImageField__imagePreview__image">
            <img src={img.gciUrl} width={img.width} height={img.height} />
          </div>
          <TextInput size="xs" radius={0} value={img.gciUrl} disabled={true} />
        </div>
      ) : (
        <div className="DocEditor__ImageField__noImage">No image</div>
      )}
      {/* <Button
        color="dark"
        size="xs"
        leftIcon={<IconPhotoUp size={16} />}
      >
        Upload image
      </Button> */}
      <label
        className="DocEditor__ImageField__uploadButton"
        role="button"
        aria-disabled={loading}
      >
        <input
          type="file"
          accept="image/png, image/jpeg"
          onChange={onFileChange}
          ref={inputRef}
        />
        <div className="DocEditor__ImageField__uploadButton__icon">
          <IconPhotoUp size={16} />
        </div>
        <div className="DocEditor__ImageField__uploadButton__label">
          Upload image
        </div>
      </label>
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
      const newlyAdded = state._new || [];
      return {...action.newValue, _new: newlyAdded};
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
          Add
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

DocEditor.SelectField = (props: FieldProps) => {
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
    <div className="DocEditor__SelectField">
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

DocEditor.MultiSelectField = (props: FieldProps) => {
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
    <div className="DocEditor__MultiSelectField">
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
