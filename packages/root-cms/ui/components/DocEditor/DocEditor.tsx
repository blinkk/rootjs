import {
  ActionIcon,
  Button,
  Checkbox,
  LoadingOverlay,
  Menu,
  MultiSelect,
  Select,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconBraces,
  IconCircleArrowDown,
  IconCircleArrowUp,
  IconCirclePlus,
  IconCopy,
  IconDotsVertical,
  IconFileUpload,
  IconPhotoUp,
  IconPlanet,
  IconRocket,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTrash,
  IconTriangleFilled,
} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useReducer, useRef, useState} from 'preact/hooks';
import {route} from 'preact-router';

import * as schema from '../../../core/schema.js';
import {
  DraftController,
  SaveState,
  UseDraftHook,
} from '../../hooks/useDraft.js';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {flattenNestedKeys} from '../../utils/objects.js';
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
import {
  RichTextData,
  RichTextEditor,
} from '../RichTextEditor/RichTextEditor.js';

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
        ) : field.type === 'boolean' ? (
          <DocEditor.BooleanField {...props} />
        ) : field.type === 'datetime' ? (
          <DocEditor.DateTimeField {...props} />
        ) : field.type === 'file' ? (
          <DocEditor.FileField {...props} />
        ) : field.type === 'image' ? (
          <DocEditor.ImageField {...props} />
        ) : field.type === 'multiselect' ? (
          <DocEditor.MultiSelectField {...props} />
        ) : field.type === 'object' ? (
          <DocEditor.ObjectField {...props} />
        ) : field.type === 'oneof' ? (
          <DocEditor.OneOfField {...props} />
        ) : field.type === 'richtext' ? (
          <DocEditor.RichTextField {...props} />
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
        maxRows={field.maxRows || 12}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(e.currentTarget.value);
        }}
      />
    );
  }
  return (
    <TextInput
      size="xs"
      radius={0}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        onChange(e.currentTarget.value);
      }}
    />
  );
};

DocEditor.RichTextField = (props: FieldProps) => {
  const field = props.field as schema.RichTextField;
  const [value, setValue] = useState<RichTextData>({
    blocks: [{type: 'paragraph', data: {}}],
  });

  function onChange(newValue: RichTextData) {
    setValue(newValue);
    props.draft.updateKey(props.deepKey, newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: RichTextData) => {
        setValue(newValue);
      }
    );
    return unsubscribe;
  }, []);

  return (
    <RichTextEditor
      value={value}
      placeholder={field.placeholder}
      onChange={onChange}
    />
  );
};

const IMAGE_MIMETYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
];

DocEditor.ImageField = (props: FieldProps) => {
  const field = props.field as schema.ImageField;
  const [img, setImg] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const exts = field.exts ?? IMAGE_MIMETYPES;
  const accept = exts.join(', ');

  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const uploadedImage = await uploadFileToGCS(file);
      setImg((currentImg: any) => {
        // Preserve the "alt" text when the image changes.
        const newImage = Object.assign({}, uploadedImage, {
          alt: currentImg?.alt || '',
        });
        props.draft.updateKey(props.deepKey, newImage);
        return newImage;
      });
      setLoading(false);
    } catch (err) {
      console.error('image upload failed');
      console.error(err);
      setLoading(false);
      showNotification({
        title: 'Image upload failed',
        message: 'Failed to upload image: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }

    // Reset the input element in case the user wishes to re-upload the image.
    if (inputRef.current) {
      const inputEl = inputRef.current;
      inputEl.value = '';
    }
  }

  function onFileChange(e: Event) {
    const inputEl = e.target as HTMLInputElement;
    const files = inputEl.files || [];
    const file = files[0];
    if (file) {
      uploadFile(file);
    }
  }

  async function setAltText(newValue: string) {
    setImg((currentImg: any) => {
      return Object.assign({}, currentImg, {alt: newValue});
    });
    props.draft.updateKey(`${props.deepKey}.alt`, newValue);
  }

  async function removeImage() {
    setImg({});
    props.draft.removeKey(props.deepKey);
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files || [];
    const file = files[0];
    if (file) {
      console.log(`file dropped ("${props.deepKey}"):`, file);
      uploadFile(file);
    }
  };

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setImg(newValue);
      }
    );

    const dropzone = ref.current;
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDragLeave);
    if (dropzone) {
      dropzone.addEventListener('drop', handleDrop);
    }
    return () => {
      unsubscribe();
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDragLeave);
      if (dropzone) {
        dropzone.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  return (
    <div
      className={joinClassNames(
        'DocEditor__ImageField',
        isDragging && 'dragging'
      )}
      ref={ref}
    >
      {img && img.src ? (
        <div className="DocEditor__ImageField__imagePreview">
          <div className="DocEditor__ImageField__imagePreview__controls">
            <Tooltip label="Remove image">
              <ActionIcon
                className="DocEditor__ImageField__imagePreview__controls__trash"
                onClick={() => removeImage()}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
          <div className="DocEditor__ImageField__imagePreview__image">
            <img
              src={img.gciUrl || img.src}
              width={img.width}
              height={img.height}
            />
            <div className="DocEditor__ImageField__imagePreview__dimens">
              {`${img.width}x${img.height}`}
            </div>
          </div>
          <TextInput
            className="DocEditor__ImageField__imagePreview__image__url"
            size="xs"
            radius={0}
            value={img.gciUrl || img.src}
            disabled={true}
          />
          <TextInput
            className="DocEditor__ImageField__imagePreview__image__alt"
            size="xs"
            radius={0}
            value={img.alt}
            label="Alt text"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setAltText(e.currentTarget.value);
            }}
          />
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
          accept={accept}
          onChange={onFileChange}
          ref={inputRef}
        />
        <div className="DocEditor__ImageField__uploadButton__icon">
          <IconPhotoUp size={16} />
        </div>
        <div className="DocEditor__ImageField__uploadButton__label">
          {loading ? 'Uploading...' : 'Upload image'}
        </div>
      </label>
    </div>
  );
};

DocEditor.FileField = (props: FieldProps) => {
  const field = props.field as schema.FileField;
  const [file, setFile] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  let accept: string | undefined = undefined;
  if (field.exts) {
    accept = field.exts.join(',');
  }

  async function removeFile() {
    setFile({});
    props.draft.removeKey(props.deepKey);
  }

  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const uploadedFile = await uploadFileToGCS(file, {
        preserveFilename: field.preserveFilename,
      });
      props.draft.updateKey(props.deepKey, uploadedFile);
      setFile(uploadedFile);
      setLoading(false);
    } catch (err) {
      console.error('file upload failed');
      console.error(err);
      setLoading(false);
      showNotification({
        title: 'File upload failed',
        message: 'Failed to upload file: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }
    // Reset the input element in case the user wishes to re-upload a file.
    if (inputRef.current) {
      const inputEl = inputRef.current;
      inputEl.value = '';
    }
  }

  function onFileChange(e: Event) {
    const inputEl = e.target as HTMLInputElement;
    const files = inputEl.files || [];
    const file = files[0];
    if (file) {
      uploadFile(file);
    }
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files || [];
    const file = files[0];
    if (file) {
      console.log(`file dropped ("${props.deepKey}"):`, file);
      uploadFile(file);
    }
  };

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setFile(newValue);
      }
    );

    const dropzone = ref.current;
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDragLeave);
    if (dropzone) {
      dropzone.addEventListener('drop', handleDrop);
    }
    return () => {
      unsubscribe();
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDragLeave);
      if (dropzone) {
        dropzone.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  return (
    <div
      className={joinClassNames(
        'DocEditor__FileField',
        isDragging && 'dragging'
      )}
      ref={ref}
    >
      {file && file.src && (
        <div className="DocEditor__FileField__controls">
          <Tooltip label="Remove file">
            <ActionIcon
              className="DocEditor__FileField__controls__trash"
              onClick={() => removeFile()}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
      )}
      {file && file.src ? (
        <div className="DocEditor__FileField__file">
          <TextInput
            className="DocEditor__FileField__file__url"
            size="xs"
            radius={0}
            value={file.src}
            disabled={true}
          />
        </div>
      ) : (
        <div className="DocEditor__FileField__noFile">No file</div>
      )}
      <label
        className="DocEditor__FileField__uploadButton"
        role="button"
        aria-disabled={loading}
      >
        <input
          type="file"
          accept={accept}
          onChange={onFileChange}
          ref={inputRef}
        />
        <div className="DocEditor__FileField__uploadButton__icon">
          <IconFileUpload size={16} />
        </div>
        <div className="DocEditor__FileField__uploadButton__label">
          {loading ? 'Uploading...' : 'Upload file'}
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

DocEditor.BooleanField = (props: FieldProps) => {
  const field = props.field as schema.BooleanField;
  const label = field.checkboxLabel || 'Enabled';
  const [value, setValue] = useState<boolean>(false);

  function onChange(newValue: boolean) {
    setValue(newValue);
    props.draft.updateKey(props.deepKey, newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: boolean) => {
        setValue(newValue);
      }
    );
    return unsubscribe;
  }, []);

  return (
    <div className="DocEditor__BooleanField">
      <Checkbox
        label={label}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          onChange(target.checked);
        }}
        checked={value}
        size="xs"
      />
    </div>
  );
};

DocEditor.DateTimeField = (props: FieldProps) => {
  // const field = props.field as schema.DateTimeField;
  const [dateStr, setDateStr] = useState('');

  function onChange(newDateStr: string) {
    if (newDateStr) {
      const millis = Math.floor(new Date(newDateStr).getTime());
      const newValue = Timestamp.fromMillis(millis);
      setDateStr(toDateStr(newValue));
      props.draft.updateKey(props.deepKey, newValue);
    } else {
      setDateStr('');
      props.draft.removeKey(props.deepKey);
    }
  }

  function toDateStr(ts: Timestamp) {
    const date = ts.toDate();
    // Subtract by the timezone offset so that toISOString() returns the local
    // datetime string.
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: Timestamp) => {
        if (newValue) {
          setDateStr(toDateStr(newValue));
        } else {
          setDateStr('');
        }
      }
    );
    return unsubscribe;
  }, []);

  return (
    <div className="DocEditor__DateTimeField">
      <input
        type="datetime-local"
        value={dateStr}
        onChange={(e: Event) => {
          const target = e.target as HTMLInputElement;
          const newDateStr = target.value;
          onChange(newDateStr);
        }}
      />
      <div className="DocEditor__DateTimeField__timezone">
        timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </div>
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
