import './DocEditor.css';

import {
  DragDropContext,
  Draggable,
  Droppable,
  DroppableProvided,
  DropResult,
} from '@hello-pangea/dnd';
import {
  ActionIcon,
  Button,
  LoadingOverlay,
  Menu,
  Select,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconBraces,
  IconChevronDown,
  IconCircleArrowDown,
  IconCircleArrowUp,
  IconCirclePlus,
  IconClipboardCopy,
  IconGripVertical,
  IconCopy,
  IconDotsVertical,
  IconLanguage,
  IconLock,
  IconPlanet,
  IconRocket,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTrash,
  IconTriangleFilled,
  IconSparkles,
} from '@tabler/icons-preact';
import {createContext} from 'preact';
import {
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useCallback,
} from 'preact/hooks';
import {route} from 'preact-router';
import * as schema from '../../../core/schema.js';
import {
  updateRichTextDataTime,
  testValidRichTextData,
} from '../../../shared/richtext.js';
import type {RichTextData} from '../../../shared/richtext.js';
import {useCollectionSchema} from '../../hooks/useCollectionSchema.js';
import {
  buildDeeplinkUrl,
  DeeplinkProvider,
  scrollToDeeplink,
  useDeeplink,
} from '../../hooks/useDeeplink.js';
import {
  DraftDocContext,
  DraftDocController,
  DraftDocEventType,
  SaveState,
  useDraftDoc,
  useDraftDocField,
  useDraftDocSaveState,
} from '../../hooks/useDraftDoc.js';
import {
  ClipboardData,
  useVirtualClipboard,
} from '../../hooks/useVirtualClipboard.js';
import {joinClassNames} from '../../utils/classes.js';
import {debounce} from '../../utils/debounce.js';
import {
  CMSDoc,
  testIsScheduled,
  testPublishingLocked,
} from '../../utils/doc.js';
import {extractField} from '../../utils/extract.js';
import {getDefaultFieldValue} from '../../utils/fields.js';
import {requestHighlightNode} from '../../utils/iframe-preview.js';
import {getNestedValue} from '../../utils/objects.js';
import {autokey} from '../../utils/rand.js';
import {strFormatFn} from '../../utils/str-format.js';
import {testFieldEmpty} from '../../utils/test-field-empty.js';
import {formatDateTime} from '../../utils/time.js';
import {useAiEditModal} from '../AiEditModal/AiEditModal.js';
import {
  DocActionEvent,
  DocActionsMenu,
} from '../DocActionsMenu/DocActionsMenu.js';
import {DocStatusBadges} from '../DocStatusBadges/DocStatusBadges.js';
import {useEditJsonModal} from '../EditJsonModal/EditJsonModal.js';
import {useEditTranslationsModal} from '../EditTranslationsModal/EditTranslationsModal.js';
import {useLocalizationModal} from '../LocalizationModal/LocalizationModal.js';
import {usePublishDocModal} from '../PublishDocModal/PublishDocModal.js';
import {Viewers} from '../Viewers/Viewers.js';
import {BooleanField} from './fields/BooleanField.js';
import {DateField} from './fields/DateField.js';
import {DateTimeField} from './fields/DateTimeField.js';
import {FieldProps} from './fields/FieldProps.js';
import {FileField} from './fields/FileField.js';
import {ImageField} from './fields/ImageField.js';
import {MultiSelectField} from './fields/MultiSelectField.js';
import {NumberField} from './fields/NumberField.js';
import {ReferenceField} from './fields/ReferenceField.js';
import {ReferencesField} from './fields/ReferencesField.js';
import {RichTextField} from './fields/RichTextField.js';
import {SelectField} from './fields/SelectField.js';
import {StringField} from './fields/StringField.js';

interface DocEditorProps {
  docId: string;
}

const COLLECTION_SCHEMA_TYPES_CONTEXT = createContext<
  Record<string, schema.Schema>
>({});

/**
 * Returns a map of types defined in the collection's schema.ts file.
 */
function useCollectionSchemaTypes(): Record<string, schema.Schema> {
  return useContext(COLLECTION_SCHEMA_TYPES_CONTEXT);
}

export function DocEditor(props: DocEditorProps) {
  const collectionId = props.docId.split('/')[0];
  // Load the full collection schema.
  const collection = useCollectionSchema(collectionId);
  const draft = useDraftDoc();
  const loading = collection.loading || draft.loading;
  const fields = collection.schema?.fields || [];

  return (
    <COLLECTION_SCHEMA_TYPES_CONTEXT.Provider
      value={collection?.schema?.types || {}}
    >
      <DeeplinkProvider>
        <div className="DocEditor">
          <LoadingOverlay
            visible={loading}
            loaderProps={{color: 'gray', size: 'xl'}}
          />
          {!loading && (
            <DocEditor.StatusBar
              {...props}
              draft={draft}
              collection={collection.schema!}
            />
          )}
          <div className="DocEditor__fields">
            {fields.map((field) => (
              <DocEditor.Field
                key={field.id}
                field={field}
                deepKey={`fields.${field.id!}`}
              />
            ))}
          </div>
        </div>
      </DeeplinkProvider>
    </COLLECTION_SCHEMA_TYPES_CONTEXT.Provider>
  );
}

type StatusBarProps = DocEditorProps & {
  draft: DraftDocContext;
  collection: schema.Collection;
};

DocEditor.StatusBar = (props: StatusBarProps) => {
  const draft = props.draft;
  const [data, setData] = useState<Partial<CMSDoc> | null>(
    draft.controller.getData()
  );

  // For the status bar, only the "sys" attr on the doc is needed.
  useDraftDocField('sys', (sys: any) => {
    const data: Partial<CMSDoc> = {sys};
    setData(data);
  });

  const onDocAction = useCallback(
    (event: DocActionEvent) => {
      if (event.action === 'delete') {
        const collectionId = props.docId.split('/')[0];
        route(`/cms/content/${collectionId}`);
      } else if (event.action === 'unlocked') {
        // NOTE(stevenle): for some reason, the unlock publishing doesn't
        // properly trigger the `onSnapshot()` callback with
        // `{hasPendingWrites: false}`. This is a temporary fix.
        // TODO(stevenle): avoid the extra db write here.
        draft.controller.removePublishingLock();
      }
    },
    [props.docId]
  );

  const publishDocModal = usePublishDocModal({docId: props.docId});
  const localizationModal = useLocalizationModal();

  const loading = !data?.sys;
  if (loading) {
    return null;
  }

  return (
    <div className="DocEditor__statusBar">
      <div className="DocEditor__statusBar__viewers">
        <Viewers id={`doc/${props.docId}`} />
      </div>
      <DocEditor.SaveState />
      {data?.sys && (
        <div className="DocEditor__statusBar__statusBadges">
          <DocStatusBadges doc={data as CMSDoc} />
        </div>
      )}
      <div className="DocEditor__statusBar__i18n">
        <Button
          variant="default"
          color="dark"
          size="xs"
          leftIcon={<IconPlanet size={16} />}
          onClick={() =>
            localizationModal.open({
              docId: props.docId,
              collection: props.collection,
              draft: draft.controller,
            })
          }
        >
          Localization
        </Button>
      </div>
      <div className="DocEditor__statusBar__publishButton">
        {loading ? (
          <Button
            color="dark"
            size="xs"
            onClick={() => publishDocModal.open()}
            loading
            disabled
          >
            Publish
          </Button>
        ) : testIsScheduled(data as CMSDoc) ? (
          <Tooltip
            label={`Scheduled ${formatDateTime(data.sys!.scheduledAt)} by ${
              data.sys!.scheduledBy
            }`}
            transition="pop"
          >
            <Button
              color="dark"
              size="xs"
              leftIcon={<IconRocket size={16} />}
              disabled
            >
              Publish
            </Button>
          </Tooltip>
        ) : testPublishingLocked(data as CMSDoc) ? (
          <Tooltip
            label={`Locked by ${data.sys!.publishingLocked.lockedBy}: "${
              data.sys!.publishingLocked.reason
            }"`}
            transition="pop"
          >
            <Button
              color="dark"
              size="xs"
              leftIcon={<IconLock size={16} />}
              disabled
            >
              Publish
            </Button>
          </Tooltip>
        ) : (
          <Button
            color="dark"
            size="xs"
            leftIcon={<IconRocket size={16} />}
            onClick={() => publishDocModal.open()}
          >
            Publish
          </Button>
        )}
      </div>
      <div className="DocEditor__statusBar__actionsMenu">
        <DocActionsMenu
          docId={props.docId}
          data={data as CMSDoc}
          onAction={onDocAction}
        />
      </div>
    </div>
  );
};

DocEditor.SaveState = () => {
  const [saveState, setSaveState] = useState<SaveState>(SaveState.NO_CHANGES);
  useDraftDocSaveState((saveState) => {
    setSaveState(saveState);
  });
  return (
    <div className="DocEditor__statusBar__saveState">
      {saveState === SaveState.SAVED && 'saved!'}
      {saveState === SaveState.SAVING && 'saving...'}
      {saveState === SaveState.UPDATES_PENDING && 'saving...'}
      {saveState === SaveState.ERROR && 'error saving'}
    </div>
  );
};

DocEditor.Field = (props: FieldProps) => {
  const field = props.field;
  const level = props.level ?? 0;
  const deeplink = useDeeplink();
  const targeted = deeplink.value === props.deepKey;
  const ref = useRef<HTMLDivElement>(null);
  const [fieldValueEmpty, setFieldValueEmpty] = useState(true);
  const types = useCollectionSchemaTypes();

  const showFieldHeader = useMemo(() => {
    if (field.type === 'object') {
      // Default to the "drawer" variant.
      const variant = field.variant || 'drawer';
      if (variant === 'drawer') {
        return false;
      }
    }
    return !props.hideHeader && !field.hideLabel;
  }, [props.hideHeader, field]);

  useDraftDocField(props.deepKey, (newValue: any) => {
    setFieldValueEmpty(testFieldEmpty(field, newValue, types));
  });

  useEffect(() => {
    if (targeted) {
      scrollToDeeplink(ref.current!);
    }
  }, [targeted]);

  // Hide deprecated fields that are empty.
  if (field.deprecated && fieldValueEmpty) {
    return null;
  }

  return (
    <div
      className={joinClassNames(
        'DocEditor__field',
        field.deprecated && 'DocEditor__field--deprecated',
        targeted && 'deeplink-target'
      )}
      data-type={field.type}
      data-level={level}
      id={props.deepKey}
      ref={ref}
    >
      {showFieldHeader && <DocEditor.FieldHeader {...props} />}
      <div className="DocEditor__field__input">
        {field.type === 'array' ? (
          <DocEditor.ArrayField {...props} />
        ) : field.type === 'boolean' ? (
          <BooleanField {...props} />
        ) : field.type === 'date' ? (
          <DateField {...props} />
        ) : field.type === 'datetime' ? (
          <DateTimeField {...props} />
        ) : field.type === 'file' ? (
          <FileField {...props} />
        ) : field.type === 'image' ? (
          <ImageField {...props} />
        ) : field.type === 'multiselect' ? (
          <MultiSelectField {...props} />
        ) : field.type === 'number' ? (
          <NumberField {...props} />
        ) : field.type === 'object' ? (
          <DocEditor.ObjectField {...props} />
        ) : field.type === 'oneof' ? (
          <DocEditor.OneOfField {...props} />
        ) : field.type === 'reference' ? (
          <ReferenceField {...props} />
        ) : field.type === 'references' ? (
          <ReferencesField {...props} />
        ) : field.type === 'richtext' ? (
          <RichTextField {...props} />
        ) : field.type === 'select' ? (
          <SelectField {...props} />
        ) : field.type === 'string' ? (
          <StringField {...props} />
        ) : (
          <div className="DocEditor__field__input__unknown">
            Unknown field type: {(field as any).type}
          </div>
        )}
      </div>
    </div>
  );
};

DocEditor.FieldHeader = (props: FieldProps & {className?: string}) => {
  const field = props.field;
  const label = field.label || field.id;
  const [value, setValue] = useState<any>(null);

  const deeplink = useDeeplink();
  const deeplinkUrl = useMemo(
    () => buildDeeplinkUrl(props.deepKey || ''),
    [props.deepKey]
  );

  useDraftDocField(props.deepKey, (value: any) => {
    setValue(value);
  });

  return (
    <div className={joinClassNames(props.className, 'DocEditor__FieldHeader')}>
      {field.deprecated ? (
        <div className="DocEditor__FieldHeader__label">DEPRECATED: {label}</div>
      ) : (
        <div className="DocEditor__FieldHeader__label">
          <span>{label}</span>
          {props.deepKey && (
            <a
              className="DocEditor__FieldHeader__label__deeplink"
              href={deeplinkUrl}
              title="Link to field"
              onClick={(e) => {
                e.preventDefault();
                window.history.replaceState({}, '', deeplinkUrl);
                deeplink.setValue(props.deepKey!);
              }}
            >
              #
            </a>
          )}
        </div>
      )}
      {field.help && (
        <div className="DocEditor__FieldHeader__help">{field.help}</div>
      )}
      <DocEditor.FieldHeaderTranslationsActionIcon
        field={field}
        value={value}
      />
    </div>
  );
};

interface FieldHeaderTranslationsActionIconProps {
  field: schema.Field;
  value: any;
}

DocEditor.FieldHeaderTranslationsActionIcon = (
  props: FieldHeaderTranslationsActionIconProps
) => {
  const field = props.field;
  const value = props.value;
  const translate: boolean = Boolean((field as any).translate);
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];
  const editTranslationsModal = useEditTranslationsModal();
  const draft = useDraftDoc();

  const types = useCollectionSchemaTypes();
  const actionIconDisabled = useMemo(
    () => !translate || testFieldEmpty(field, value, types),
    [field, value]
  );

  if (!translate || i18nLocales.length <= 1) {
    return null;
  }

  return (
    <div className="DocEditor__FieldHeader__translate">
      {!actionIconDisabled ? (
        <Tooltip label="Show translations">
          <ActionIcon
            size="xs"
            onClick={() => {
              const docData = draft.controller.getData();
              if (!docData) {
                return;
              }
              const strings = new Set<string>();
              extractField(strings, field, value, types);
              const translateStrings = Array.from(strings);
              editTranslationsModal.open({
                docId: draft.controller.docId,
                strings: translateStrings,
                l10nSheet: docData?.sys?.l10nSheet,
              });
            }}
          >
            <IconLanguage size={16} />
          </ActionIcon>
        </Tooltip>
      ) : (
        <div className="DocEditor__FieldHeader__translate__iconDisabled">
          <IconLanguage size={16} />
        </div>
      )}
    </div>
  );
};

DocEditor.ObjectField = (props: FieldProps) => {
  const field = props.field as schema.ObjectField;
  // Default to the "drawer" variant.
  let variant = field.variant;
  if (!variant) {
    if (props.isArrayChild) {
      variant = 'inline';
    } else {
      variant = 'drawer';
    }
  }
  if (variant === 'drawer') {
    return <DocEditor.ObjectFieldDrawer {...props} />;
  }
  // Inline variant, used by the ArrayField.
  return (
    <div className="DocEditor__ObjectField">
      <div className="DocEditor__ObjectField__fields">
        {field.fields.map((field) => (
          <DocEditor.Field
            key={field.id}
            field={field}
            deepKey={`${props.deepKey}.${field.id}`}
          />
        ))}
      </div>
    </div>
  );
};

DocEditor.ObjectFieldDrawer = (props: FieldProps) => {
  const field = props.field as schema.ObjectField;
  const collapsed = field.drawerOptions?.collapsed || false;
  const inline = field.drawerOptions?.inline || false;
  const iconPosition = inline ? 'left' : 'right';

  const deeplink = useDeeplink();
  const initialOpen = !collapsed || deeplink.value.includes(props.deepKey);

  return (
    <div
      className={joinClassNames(
        'DocEditor__ObjectFieldDrawer',
        inline && 'DocEditor__ObjectFieldDrawer--inline'
      )}
    >
      <details
        className="DocEditor__ObjectFieldDrawer__drawer"
        open={initialOpen}
      >
        <summary
          className={joinClassNames(
            'DocEditor__ObjectFieldDrawer__drawer__toggle',
            `DocEditor__ObjectFieldDrawer__drawer__toggle--icon-${iconPosition}`
          )}
        >
          <DocEditor.FieldHeader
            className="DocEditor__ObjectFieldDrawer__drawer__toggle__header"
            field={field}
            deepKey={props.deepKey}
          />
          <div className="DocEditor__ObjectFieldDrawer__drawer__toggle__icon">
            <IconChevronDown size={16} />
          </div>
        </summary>
        <div className="DocEditor__ObjectFieldDrawer__drawer__content DocEditor__ObjectFieldDrawer__fields">
          {field.fields.map((field) => (
            <DocEditor.Field
              key={field.id}
              field={field}
              deepKey={`${props.deepKey}.${field.id}`}
            />
          ))}
        </div>
      </details>
    </div>
  );
};

interface ArrayFieldValue {
  [key: string]: any;
  _array: string[];
  /** Tracks the last-moved array item. */
  _moved?: string;
  _new?: string[];
}

type ArrayItemValue = Record<string, any>;

interface ArrayUpdate {
  type: 'update';
  newValue: ArrayFieldValue;
}

interface ArrayUpdateItem {
  type: 'updateItem';
  index: number;
  newValue: ArrayItemValue;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayAdd {
  type: 'add';
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayInsertBefore {
  type: 'insertBefore';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayInsertAfter {
  type: 'insertAfter';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayDuplicate {
  type: 'duplicate';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  value: ArrayItemValue;
}

interface ArrayMoveUp {
  type: 'moveUp';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayMoveDown {
  type: 'moveDown';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayMoveTo {
  type: 'moveTo';
  fromIndex: number;
  toIndex: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayRemoveAt {
  type: 'removeAt';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayPasteAfter {
  type: 'pasteAfter';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  data: ClipboardData;
}

interface ArrayPasteBefore {
  type: 'pasteBefore';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  data: ClipboardData;
}

type ArrayAction =
  | ArrayAdd
  | ArrayDuplicate
  | ArrayInsertAfter
  | ArrayInsertBefore
  | ArrayMoveDown
  | ArrayMoveUp
  | ArrayMoveTo
  | ArrayPasteAfter
  | ArrayPasteBefore
  | ArrayRemoveAt
  | ArrayUpdate
  | ArrayUpdateItem;

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
      const newKey = autokey();
      const clonedValue = structuredClone(action.value);
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
        _moved: order[action.index - 1],
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
        _moved: order[action.index + 1],
      };
    }
    case 'moveTo': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      if (
        action.fromIndex < 0 ||
        action.fromIndex >= order.length ||
        action.toIndex < 0 ||
        action.toIndex >= order.length
      ) {
        console.error('Invalid moveTo index', action);
        return state;
      }
      const itemKey = order[action.fromIndex];
      arrayMove(order, action.fromIndex, action.toIndex);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
      });
      return {
        ...data,
        _array: order,
        _moved: itemKey,
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
    case 'pasteAfter': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      const newData = action.data;
      if (!newData) {
        showNotification({
          title: 'Skipped',
          message: 'Nothing to paste.',
          autoClose: true,
        });
        return state;
      }
      order.splice(action.index + 1, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: newData,
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: newData,
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'pasteBefore': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      const newData = action.data;
      if (!newData) {
        showNotification({
          title: 'Skipped',
          message: 'Nothing to paste.',
          autoClose: true,
        });
        return state;
      }
      order.splice(action.index, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: newData,
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: newData,
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    default: {
      console.error('unknown action', action);
      return state;
    }
  }
}

DocEditor.ArrayField = (props: FieldProps) => {
  const draft = useDraftDoc().controller;
  const field = props.field as schema.ArrayField;
  const [value, dispatch] = useReducer(arrayReducer, {_array: []});
  const deeplink = useDeeplink();
  const virtualClipboard = useVirtualClipboard();
  const experiments = window.__ROOT_CTX.experiments || {};

  const data = value ?? {};
  const order = data._array || [];

  // Keep track of newly-added keys, which should start in the "open" state.
  const newlyAdded = value._new || [];

  useDraftDocField(props.deepKey, (newValue: ArrayFieldValue) => {
    dispatch({type: 'update', newValue});
  });

  // Focus the field that was just moved (for hotkey support).
  useEffect(() => {
    if (value._moved) {
      focusFieldHeader(props.deepKey, order.indexOf(value._moved));
    }
  }, [value]);

  /** Returns the array item's field value from the draft controller. */
  const getItemValue = (index: number) => {
    const key = order[index];
    const itemKey = `${props.deepKey}.${key}`;
    return draft.getValue(itemKey) || {};
  };

  const add = () => {
    dispatch({type: 'add', draft: draft, deepKey: props.deepKey});
  };

  const pasteBefore = (index: number, data: ClipboardData) => {
    dispatch({
      type: 'pasteBefore',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
      data,
    });
  };

  const pasteAfter = (index: number, data: ClipboardData) => {
    dispatch({
      type: 'pasteAfter',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
      data,
    });
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
      value: getItemValue(index),
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

  /** Focus the field header (the clickable "summary" part). */
  const focusFieldHeader = (deepKey: string, index: number) => {
    document.getElementById(`summary-for-${deepKey}.${order[index]}`)?.focus();
  };

  const moveUp = (index: number) => {
    if (index > 0) {
      dispatch({
        type: 'moveUp',
        draft: draft,
        deepKey: props.deepKey,
        index: index,
      });
    }
  };

  const moveDown = (index: number) => {
    if (index < order.length - 1) {
      dispatch({
        type: 'moveDown',
        draft: draft,
        deepKey: props.deepKey,
        index: index,
      });
    }
  };

  /** Copies the item data to the virtual clipboard. */
  const copyToVirtualClipboard = (index: number) => {
    const data = getItemValue(index);
    virtualClipboard.set(data);
  };

  const editJsonModal = useEditJsonModal();
  const aiEditModal = useAiEditModal();

  const editJson = (index: number) => {
    const data = getItemValue(index);
    editJsonModal.open({
      data: data,
      onSave: (newValue) => {
        console.log('[edit json] onSave()', newValue);
        dispatch({
          type: 'updateItem',
          draft,
          index,
          newValue: updateRichTextDataTime(newValue),
          deepKey: props.deepKey,
        });
        editJsonModal.close();
      },
    });
  };

  const aiEdit = (index: number) => {
    const data = getItemValue(index);
    aiEditModal.open({
      data: data,
      onSave: (newValue) => {
        console.log('[ai edit] onSave()', newValue);
        dispatch({
          type: 'updateItem',
          draft,
          index,
          newValue: updateRichTextDataTime(newValue),
          deepKey: props.deepKey,
        });
        aiEditModal.close();
      },
    });
  };

  function itemInDeeplink(itemKey: string) {
    return Boolean(deeplink.value.startsWith(`${props.deepKey}.${itemKey}`));
  }

  /** Handler for using the arrow keys when the array item's header is focused.  */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent, arrayKey: string) => {
      if (!e.target) {
        return;
      }
      // Move the items up and down using the up/down arrow keys.
      // Collapse and expand the item using the left/right arrow keys.
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveUp(order.indexOf(arrayKey));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveDown(order.indexOf(arrayKey));
      } else if (e.key === 'ArrowLeft') {
        (e.target as HTMLElement).closest('details')!.open = false;
      } else if (e.key === 'ArrowRight') {
        (e.target as HTMLElement).closest('details')!.open = true;
      }
    },
    [props.deepKey]
  );

  const addButtonRow = (
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
  );

  if (order.length === 0 && !value._new) {
    return (
      <div className="DocEditor__ArrayField">
        <div className="DocEditor__ArrayField__items">
          <div className="DocEditor__ArrayField__items__empty">No items</div>
        </div>
        {addButtonRow}
      </div>
    );
  }

  return (
    <div className="DocEditor__ArrayField">
      <DragDropContext
        onDragEnd={(result: DropResult) => {
          const {source, destination} = result;
          if (!destination) {
            return;
          }
          dispatch({
            type: 'moveTo',
            fromIndex: source.index,
            toIndex: destination.index,
            draft,
            deepKey: props.deepKey,
          });
        }}
      >
        <Droppable droppableId="dnd-list" direction="vertical">
          {(provided: DroppableProvided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="DocEditor__ArrayField__items"
            >
              {order.map((key: string, i: number) => {
                return (
                  <Draggable key={key} index={i} draggableId={key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={joinClassNames(
                          'DocEditor__ArrayField__item__wrapper',
                          snapshot.isDragging &&
                            'DocEditor__ArrayField__item__wrapper--dragging'
                        )}
                      >
                        <div
                          className="DocEditor__ArrayField__item__handle"
                          {...provided.dragHandleProps}
                        >
                          <IconGripVertical size={18} stroke={'1.5'} />
                        </div>
                        <details
                          className="DocEditor__ArrayField__item"
                          key={key}
                          open={newlyAdded.includes(key) || itemInDeeplink(key)}
                          onToggle={(e) => {
                            if ((e.target as HTMLDetailsElement).open) {
                              requestHighlightNode(
                                `${props.deepKey}.${order[i]}`,
                                {scroll: true}
                              );
                            } else {
                              requestHighlightNode(null);
                            }
                          }}
                          onMouseEnter={() => {
                            requestHighlightNode(
                              `${props.deepKey}.${order[i]}`
                            );
                          }}
                          onMouseLeave={() => {
                            requestHighlightNode(null);
                          }}
                        >
                          <summary
                            id={`summary-for-${props.deepKey}.${order[i]}`}
                            className="DocEditor__ArrayField__item__header"
                            onKeyDown={(e: KeyboardEvent) =>
                              handleKeyDown(e, key)
                            }
                            tabIndex={0}
                          >
                            <div className="DocEditor__ArrayField__item__header__icon">
                              <IconTriangleFilled size={6} />
                            </div>
                            <DocEditor.ArrayFieldPreview
                              field={field}
                              deepKey={`${props.deepKey}.${key}`}
                              index={i}
                            />
                            <div className="DocEditor__ArrayField__item__header__controls">
                              <div className="DocEditor__ArrayField__item__header__controls__arrows">
                                <button
                                  className="DocEditor__ArrayField__item__header__controls__arrow DocEditor__ArrayField__item__header__controls__arrows--up"
                                  onClick={() => moveUp(i)}
                                >
                                  <IconCircleArrowUp
                                    size={20}
                                    strokeWidth={1.75}
                                  />
                                </button>
                                <button
                                  className="DocEditor__ArrayField__item__header__controls__arrow DocEditor__ArrayField__item__header__controls__arrows--down"
                                  onClick={() => moveDown(i)}
                                >
                                  <IconCircleArrowDown
                                    size={20}
                                    strokeWidth={1.75}
                                  />
                                </button>
                              </div>
                              <Menu
                                className="DocEditor__ArrayField__item__header__controls__menu"
                                position="bottom"
                                transitionDuration={0}
                                control={
                                  <ActionIcon className="DocEditor__ArrayField__item__header__controls__dots">
                                    <IconDotsVertical size={16} />
                                  </ActionIcon>
                                }
                              >
                                <Menu.Label>INSERT</Menu.Label>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconRowInsertTop size={18} />}
                                  onClick={() => insertBefore(i)}
                                >
                                  Add before
                                </Menu.Item>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconRowInsertBottom size={18} />}
                                  onClick={() => insertAfter(i)}
                                >
                                  Add after
                                </Menu.Item>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconCopy size={18} />}
                                  onClick={() => duplicate(i)}
                                >
                                  Duplicate
                                </Menu.Item>
                                <Menu.Label>CLIPBOARD</Menu.Label>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconClipboardCopy size={18} />}
                                  onClick={() => copyToVirtualClipboard(i)}
                                >
                                  Copy
                                </Menu.Item>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconRowInsertTop size={18} />}
                                  onClick={async () =>
                                    pasteBefore(i, await virtualClipboard.get())
                                  }
                                >
                                  Paste before
                                </Menu.Item>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconRowInsertBottom size={18} />}
                                  onClick={async () =>
                                    pasteAfter(i, await virtualClipboard.get())
                                  }
                                >
                                  Paste after
                                </Menu.Item>
                                <Menu.Label>CODE</Menu.Label>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconBraces size={18} />}
                                  onClick={() => editJson(i)}
                                >
                                  Edit JSON
                                </Menu.Item>
                                {experiments.ai && (
                                  <Menu.Item
                                    className="DocEditor__ArrayField__item__header__controls__menu__item"
                                    icon={
                                      <IconSparkles size={18} stroke="1.75" />
                                    }
                                    onClick={() => aiEdit(i)}
                                  >
                                    Edit with AI
                                  </Menu.Item>
                                )}
                                <Menu.Label>REMOVE</Menu.Label>
                                <Menu.Item
                                  className="DocEditor__ArrayField__item__header__controls__menu__item"
                                  icon={<IconTrash size={18} />}
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
                              field={field.of}
                              deepKey={`${props.deepKey}.${key}`}
                              hideHeader
                              isArrayChild
                              onFocus={() => {
                                requestHighlightNode(
                                  `${props.deepKey}.${key}`,
                                  {scroll: true}
                                );
                              }}
                              onBlur={() => {
                                requestHighlightNode(null);
                              }}
                            />
                          </div>
                        </details>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {addButtonRow}
    </div>
  );
};

interface ArrayFieldPreviewProps {
  field: schema.ArrayField;
  deepKey: string;
  index: number;
}

DocEditor.ArrayFieldPreview = (props: ArrayFieldPreviewProps) => {
  const draft = useDraftDoc().controller;
  const [value, setValue] = useState<any>(draft.getValue(props.deepKey));

  const previewImage = useMemo(() => {
    return arrayPreviewImage(props.field, value);
  }, [value]);
  const previewText = useMemo(() => {
    return arrayPreview(props.field, value, props.index);
  }, [value, props.index]);

  // Since re-calculating the preview text can be expensive, use a debounced
  // callback for updating the value.
  const onValueChange = useCallback(
    debounce(() => {
      const newValue = draft.getValue(props.deepKey);
      // A new object is created to force re-rendering on the preview text.
      setValue({...newValue});
    }, 250),
    [props.deepKey, draft]
  );

  useEffect(() => {
    return draft.on(
      DraftDocEventType.VALUE_CHANGE,
      (key: string, newValue: any) => {
        if (key === props.deepKey) {
          setValue(newValue);
        } else if (key.startsWith(props.deepKey)) {
          onValueChange();
        }
      }
    );
  }, [props.deepKey, draft]);

  return (
    <div className="DocEditor__ArrayField__item__header__preview">
      {previewImage && (
        <div className="DocEditor__ArrayField__item__header__preview__image">
          <img
            src={previewImage}
            alt=""
            className="DocEditor__ArrayField__item__header__preview__image__img"
            loading="lazy"
          />
        </div>
      )}
      <div className="DocEditor__ArrayField__item__header__preview__title">
        {previewText}
      </div>
    </div>
  );
};

DocEditor.OneOfField = (props: FieldProps) => {
  const field = props.field as schema.OneOfField;
  const [type, setType] = useState('');
  const collectionTypes = useCollectionSchemaTypes();
  const typesMap: Record<string, schema.Schema> = {};
  const dropdownValues: Array<{value: string; label: string}> = [
    {value: '', label: field.placeholder || 'Select type'},
  ];
  field.types.forEach((typedef) => {
    if (typeof typedef === 'string') {
      typesMap[typedef] = collectionTypes[typedef];
      dropdownValues.push({value: typedef, label: typedef});
    } else {
      typesMap[typedef.name] = typedef;
      dropdownValues.push({value: typedef.name, label: typedef.name});
    }
  });
  const selectedType = typesMap[type || ''];
  const draft = useDraftDoc().controller;

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

    await draft.updateKey(props.deepKey, newValue);
    setType(newType);
  }

  useDraftDocField(props.deepKey, (newValue: any) => {
    if (newValue?._type) {
      setType(newValue._type || '');
      cachedValues[newValue._type] = newValue;
    }
  });

  // When the dropdown receives focus, highlight the <input> text so that it can
  // be easily searched.
  function onDropdownFocus(e: FocusEvent) {
    const target = e.target as HTMLInputElement;
    if (target && target.select) {
      target.select();
    }
  }

  return (
    <div className="DocEditor__OneOfField">
      <div className="DocEditor__OneOfField__select">
        <div className="DocEditor__OneOfField__select__label">Type:</div>
        <Select
          data={dropdownValues}
          value={type}
          placeholder={field.placeholder}
          onChange={(e: string) => onTypeChange(e || '')}
          onFocus={onDropdownFocus}
          size="xs"
          radius={0}
          searchable
          // Due to issues with preact/compat, use a div for the dropdown el.
          dropdownComponent="div"
        />
      </div>
      {selectedType && (
        <div className="DocEditor__OneOfField__fields">
          {selectedType.fields.map((field) => (
            <DocEditor.Field
              key={`${type}::${field.id}`}
              field={field}
              deepKey={`${props.deepKey}.${field.id!}`}
              onBlur={() => {
                requestHighlightNode(null);
              }}
              onFocus={() => {
                requestHighlightNode(`${props.deepKey}.${field.id!}`, {
                  scroll: true,
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Swaps two elements in an array at the specified indices.
 *
 * @example
 * ```typescript
 * const numbers = [1, 2, 3, 4];
 * arraySwap(numbers, 0, 2); // Returns [3, 2, 1, 4]
 * ```
 */
function arraySwap<T = unknown>(arr: T[], index1: number, index2: number) {
  if (arr.length <= 1) {
    return arr;
  }
  const tmp = arr[index1];
  arr[index1] = arr[index2];
  arr[index2] = tmp;
  return arr;
}

/**
 * Moves an element in an array from one index to another.
 *
 * @example
 * ```typescript
 * const numbers = [1, 2, 3, 4];
 * arrayMove(numbers, 0, 2); // Returns [2, 3, 1, 4]
 * ```
 */
function arrayMove<T = unknown>(arr: T[], fromIndex: number, toIndex: number) {
  const [movedElement] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, movedElement);
}

/** Returns the string templates for field previews from the schema-level data. */
function getSchemaPreviewTemplates(
  arrayOfField: schema.ObjectLikeField,
  data: any,
  key: 'title' | 'image' = 'title'
): string | string[] | null {
  const types = useCollectionSchemaTypes();
  if (arrayOfField.type === 'oneof') {
    const oneOfField = arrayOfField as schema.OneOfField;
    const selectedTypeName = data?._type;
    if (selectedTypeName) {
      let selectedSchema: schema.Schema | undefined;
      const fieldTypes = oneOfField.types || [];
      if (typeof fieldTypes[0] === 'string') {
        selectedSchema = types[selectedTypeName];
      } else {
        selectedSchema = (fieldTypes as any[]).find(
          (schema) => schema.name === selectedTypeName
        );
      }
      return selectedSchema?.preview?.[key] || null;
    }
  }
  return null;
}

/** Returns the first line of text from rich text data. */
function getRichTextPreview(data: RichTextData): string | undefined {
  const blocks = data?.blocks || [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      let text = block.data?.text || '';
      text = text.replace(/<br\s*\/?>/gi, '\n');
      text = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      const firstLine = text.split(/\r?\n/)[0].trim();
      if (firstLine) {
        return firstLine;
      }
    }
  }
  return undefined;
}

class PlaceholderNotFoundError extends Error {}

/**
 * Builds the value to display given a set of string templates to use for
 * previews.
 */
function buildPreviewValue(
  previews: string | string[],
  data: any,
  index?: number
): string | undefined {
  const templates = Array.isArray(previews) ? previews : [previews];

  const getPlaceholder = (key: string) => {
    if (index !== undefined) {
      if (key === '_index' || key === '_index0') {
        return String(index);
      }
      if (key === '_index1') {
        return String(index + 1);
      }
      if (key === '_index:02') {
        return String(index).padStart(2, '0');
      }
      if (key === '_index:03') {
        return String(index).padStart(3, '0');
      }
    }
    const val = getNestedValue(data, key);
    if (!val) {
      throw new PlaceholderNotFoundError(key);
    }
    if (testValidRichTextData(val)) {
      const richTextPreview = getRichTextPreview(val as RichTextData);
      if (richTextPreview) {
        return richTextPreview;
      }
    }
    return String(val);
  };

  for (const template of templates) {
    try {
      const preview = strFormatFn(template, getPlaceholder);
      return preview;
    } catch (err) {
      if (err instanceof PlaceholderNotFoundError) {
        continue;
      }
      throw err;
    }
  }
  return undefined;
}

/** Builds the preview image for an array item. */
function arrayPreviewImage(
  field: schema.ArrayField,
  data: any
): string | undefined {
  const schemaLevelTemplates = getSchemaPreviewTemplates(
    field.of,
    data,
    'image'
  );
  if (!schemaLevelTemplates) {
    return undefined;
  }
  return buildPreviewValue(schemaLevelTemplates, data);
}

/** Builds the preview for an array item. */
function arrayPreview(
  field: schema.ArrayField,
  data: any,
  index: number
): string {
  // First, check if the item has a preview defined at the schema level.
  const schemaLevelTemplates = getSchemaPreviewTemplates(
    field.of,
    data,
    'title'
  );
  if (schemaLevelTemplates) {
    const result = buildPreviewValue(schemaLevelTemplates, data, index);
    if (result) {
      return result;
    }
  }
  // Fall back to array-level preview.
  if (!field.preview) {
    return `item ${index}`;
  }
  return buildPreviewValue(field.preview, data, index) ?? `item ${index}`;
}
