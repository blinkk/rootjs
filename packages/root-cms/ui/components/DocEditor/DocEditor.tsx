import './DocEditor.css';

import {
  ActionIcon,
  Button,
  LoadingOverlay,
  Menu,
  Select,
  Tooltip,
} from '@mantine/core';
import {
  IconBraces,
  IconChevronDown,
  IconCircleArrowDown,
  IconCircleArrowUp,
  IconCirclePlus,
  IconClipboardCopy,
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
import {useCollectionSchema} from '../../hooks/useCollectionSchema.js';
import {
  DraftController,
  SaveState,
  UseDraftHook,
} from '../../hooks/useDraft.js';
import {useVirtualClipboard, VirtualClipboard} from '../../hooks/useVirtualClipboard.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  CMSDoc,
  testIsScheduled,
  testPublishingLocked,
} from '../../utils/doc.js';
import {extractField} from '../../utils/extract.js';
import {getDefaultFieldValue} from '../../utils/fields.js';
import {flattenNestedKeys} from '../../utils/objects.js';
import {autokey} from '../../utils/rand.js';
import {getPlaceholderKeys, strFormat} from '../../utils/str-format.js';
import {formatDateTime} from '../../utils/time.js';
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
import {DateTimeField} from './fields/DateTimeField.js';
import {DateField} from './fields/DateField.js';
import {FieldProps} from './fields/FieldProps.js';
import {FileField} from './fields/FileField.js';
import {ImageField} from './fields/ImageField.js';
import {MultiSelectField} from './fields/MultiSelectField.js';
import {ReferenceField} from './fields/ReferenceField.js';
import {RichTextField} from './fields/RichTextField.js';
import {SelectField} from './fields/SelectField.js';
import {StringField} from './fields/StringField.js';
import {NumberField} from './fields/NumberField.js';
import {UidField} from './fields/UidField.js';
import {testFieldEmpty} from '../../utils/test-field-empty.js';

interface DocEditorProps {
  docId: string;
  collection: schema.Collection;
  draft: UseDraftHook;
}

const DEEPLINK_CONTEXT = createContext('');
const DOC_DATA_CONTEXT = createContext(null);
const VIRTUAL_CLIPBOARD_CONTEXT = createContext<{
  value: any;
  setValue: (value: any) => void;
}>({value: null, setValue: () => {}});

function useDeeplink(): string {
  return useContext(DEEPLINK_CONTEXT);
}

function useDocData(): CMSDoc {
  return useContext(DOC_DATA_CONTEXT)!;
}

export function DocEditor(props: DocEditorProps) {
  // Load the full collection schema.
  const collection = useCollectionSchema(props.collection.id);
  const draft = props.draft;
  const {controller, saveState, data} = draft;
  const [deeplink, setDeeplink] = useState('');
  const [clipboardValue, setClipboardValue] = useState(null);
  const loading = collection.loading || draft.loading;
  const fields = collection.schema?.fields || [];

  const goBack = useCallback(() => {
    const collectionId = props.docId.split('/')[0];
    route(`/cms/content/${collectionId}`);
  }, [props.docId]);

  const onDocAction = useCallback(
    (event: DocActionEvent) => {
      if (event.action === 'delete') {
        goBack();
      }
    },
    [goBack]
  );

  const publishDocModal = usePublishDocModal({docId: props.docId});
  const localizationModal = useLocalizationModal({
    docId: props.docId,
    draft: controller,
    collection: props.collection,
  });

  useEffect(() => {
    if (loading) {
      return;
    }
    const url = new URL(window.location.href);
    const deeplink = url.searchParams.get('deeplink');
    if (deeplink) {
      setDeeplink(deeplink);
    }
  }, [loading]);

  return (
    <VIRTUAL_CLIPBOARD_CONTEXT.Provider
      value={{value: clipboardValue, setValue: setClipboardValue}}
    >
      <DOC_DATA_CONTEXT.Provider value={data}>
        <DEEPLINK_CONTEXT.Provider value={deeplink}>
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
                ) : testIsScheduled(data) ? (
                  <Tooltip
                    label={`Scheduled ${formatDateTime(
                      data.sys.scheduledAt
                    )} by ${data.sys.scheduledBy}`}
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
                ) : testPublishingLocked(data) ? (
                  <Tooltip
                    label={`Locked by ${data.sys.publishingLocked.lockedBy}: "${data.sys.publishingLocked.reason}"`}
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
        </DEEPLINK_CONTEXT.Provider>
      </DOC_DATA_CONTEXT.Provider>
    </VIRTUAL_CLIPBOARD_CONTEXT.Provider>
  );
}

DocEditor.Field = (props: FieldProps) => {
  // const [targeted, setTargeted] = useState(false);
  const field = props.field;
  const level = props.level ?? 0;
  const deeplink = useDeeplink();
  const targeted = deeplink === props.deepKey;
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(null);
  const [translateStrings, setTranslateStrings] = useState<string[]>([]);

  let showFieldHeader = !props.hideHeader && !field.hideLabel;
  // The "drawer" variant shows the header within the accordion button.
  if (field.type === 'object') {
    // Default to the "drawer" variant.
    const variant = field.variant || 'drawer';
    if (variant === 'drawer') {
      showFieldHeader = false;
    }
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: any) => {
        setValue(newValue);
      }
    );
    return unsubscribe;
  }, [props.draft, props.deepKey]);

  useEffect(() => {
    const translate = (field as any).translate;
    if (!translate) {
      return;
    }
    if (!value) {
      return;
    }
    const strings = new Set<string>();
    extractField(strings, field, value);
    setTranslateStrings(Array.from(strings));
  }, [value]);

  useEffect(() => {
    if (targeted) {
      scrollToDeeplink(ref.current!);
    }
  }, [targeted]);

  if (field.deprecated && testFieldEmpty(field, value)) {
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
      {showFieldHeader && (
        <DocEditor.FieldHeader
          deepKey={props.deepKey}
          label={field.label || field.id}
          help={field.help}
          deprecated={field.deprecated}
          translate={(field as any).translate}
          translateStrings={translateStrings}
        />
      )}
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
        ) : field.type === 'richtext' ? (
          <RichTextField {...props} />
        ) : field.type === 'select' ? (
          <SelectField {...props} />
        ) : field.type === 'string' ? (
          <StringField {...props} />
        ) : field.type === 'uid' ? (
          <UidField {...props} />
        ) : (
          <div className="DocEditor__field__input__unknown">
            Unknown field type: {field.type}
          </div>
        )}
      </div>
    </div>
  );
};

DocEditor.FieldHeader = (props: {
  className?: string;
  deepKey?: string;
  label?: string;
  help?: string;
  deprecated?: boolean;
  translate?: boolean;
  translateStrings?: string[];
}) => {
  function deeplinkUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('deeplink', props.deepKey!);
    return url.toString();
  }

  const docData = useDocData() || {};
  const l10nSheet = docData.sys?.l10nSheet;

  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];
  const editTranslationsModal = useEditTranslationsModal();
  const translateStrings = (props.translate && props.translateStrings) || [];
  const translateDisabled = translateStrings.length === 0;

  return (
    <div className={joinClassNames(props.className, 'DocEditor__FieldHeader')}>
      {props.deprecated ? (
        <div className="DocEditor__FieldHeader__label">
          DEPRECATED: {props.label}
        </div>
      ) : (
        <div className="DocEditor__FieldHeader__label">
          <span>{props.label}</span>
          {props.deepKey && (
            <a
              className="DocEditor__FieldHeader__label__deeplink"
              href={deeplinkUrl()}
            >
              #
            </a>
          )}
        </div>
      )}
      {props.help && (
        <div className="DocEditor__FieldHeader__help">{props.help}</div>
      )}
      {i18nLocales.length > 1 && props.translate && (
        <div className="DocEditor__FieldHeader__translate">
          {translateDisabled ? (
            <div className="DocEditor__FieldHeader__translate__iconDisabled">
              <IconLanguage size={16} />
            </div>
          ) : (
            <Tooltip label="Show translations">
              <ActionIcon
                size="xs"
                onClick={() =>
                  editTranslationsModal.open({
                    docId: docData.id,
                    strings: translateStrings,
                    l10nSheet,
                  })
                }
              >
                <IconLanguage size={16} />
              </ActionIcon>
            </Tooltip>
          )}
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

DocEditor.ObjectFieldDrawer = (props: FieldProps) => {
  const field = props.field as schema.ObjectField;
  const collapsed = field.drawerOptions?.collapsed || false;
  const inline = field.drawerOptions?.inline || false;
  const iconPosition = inline ? 'left' : 'right';

  const deeplink = useDeeplink() || '';
  const initialOpen = !collapsed || deeplink.includes(props.deepKey);

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
            deepKey={props.deepKey}
            label={field.label || field.id}
            help={field.help}
          />
          <div className="DocEditor__ObjectFieldDrawer__drawer__toggle__icon">
            <IconChevronDown size={16} />
          </div>
        </summary>
        <div className="DocEditor__ObjectFieldDrawer__drawer__content DocEditor__ObjectFieldDrawer__fields">
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

interface ArrayPasteAfter {
  type: 'pasteAfter';
  index: number;
  draft: DraftController;
  deepKey: string;
  virtualClipboard: VirtualClipboard;
}

interface ArrayPasteBefore {
  type: 'pasteBefore';
  index: number;
  draft: DraftController;
  deepKey: string;
  virtualClipboard: VirtualClipboard;
}

type ArrayAction =
  | ArrayAdd
  | ArrayDuplicate
  | ArrayInsertAfter
  | ArrayInsertBefore
  | ArrayMoveDown
  | ArrayMoveUp
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
      const newData = action.virtualClipboard.value;
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
      const newData = action.virtualClipboard.value;
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
  const draft = props.draft;
  const field = props.field as schema.ArrayField;
  const [value, dispatch] = useReducer(arrayReducer, {_array: []});
  const deeplink = useDeeplink();
  const virtualClipboard = useVirtualClipboard();

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
  }, [props.draft, props.deepKey]);

  // Focus the field that was just moved (for hotkey support).
  useEffect(() => {
    if (value._moved) {
      focusFieldHeader(props.deepKey, order.indexOf(value._moved));
    }
  }, [value]);

  const add = () => {
    dispatch({type: 'add', draft: draft, deepKey: props.deepKey});
  };

  const pasteBefore = (index: number) => {
    dispatch({
      type: 'pasteBefore',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
      virtualClipboard: virtualClipboard,
    });
  };

  const pasteAfter = (index: number) => {
    dispatch({
      type: 'pasteAfter',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
      virtualClipboard: virtualClipboard,
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

  /** Copies the item data to the state so it can be "pasted" via the context menu later. */
  const copyToVirtualClipboard = (index: number) => {
    const key = order[index];
    const item = value[key];
    virtualClipboard.set(item);
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

  function itemInDeeplink(itemKey: string) {
    return Boolean(
      deeplink && deeplink.startsWith(`${props.deepKey}.${itemKey}`)
    );
  }

  /** Handler for using the arrow keys when the array item's header is focused.  */
  function handleKeyDown(e: KeyboardEvent, arrayKey: string) {
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
  }

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
            open={newlyAdded.includes(key) || itemInDeeplink(key)}
          >
            <summary
              id={`summary-for-${props.deepKey}.${order[i]}`}
              className="DocEditor__ArrayField__item__header"
              onKeyDown={(e: KeyboardEvent) => handleKeyDown(e, key)}
              tabIndex={0}
            >
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
                  <Menu.Label>CLIPBOARD</Menu.Label>
                  <Menu.Item
                    icon={<IconClipboardCopy size={20} />}
                    // Allow the menu to close before updating the virtual clipboard (avoids layout shift)
                    // in the menu that may be distracting.
                    onClick={() =>
                      setTimeout(() => copyToVirtualClipboard(i), 500)
                    }
                  >
                    Copy
                  </Menu.Item>
                  {virtualClipboard.value && (
                    <>
                      <Menu.Item
                        icon={<IconRowInsertTop size={20} />}
                        onClick={() => pasteBefore(i)}
                      >
                        Paste before
                      </Menu.Item>
                      <Menu.Item
                        icon={<IconRowInsertBottom size={20} />}
                        onClick={() => pasteAfter(i)}
                      >
                        Paste after
                      </Menu.Item>
                    </>
                  )}
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
                isArrayChild
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
  }, [props.draft, props.deepKey]);

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
  placeholders._index0 = String(index);
  placeholders._index1 = String(index + 1);
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

function scrollToDeeplink(deeplinkEl: HTMLElement) {
  const parent = document.querySelector('.DocumentPage__side');
  if (parent) {
    const offsetTop = deeplinkEl.offsetTop;
    parent.scroll({top: offsetTop, behavior: 'smooth'});
  }
}
