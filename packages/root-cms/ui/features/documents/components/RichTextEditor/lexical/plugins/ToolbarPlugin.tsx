import {$isLinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link';
import {$isListNode, ListNode} from '@lexical/list';
import {INSERT_HORIZONTAL_RULE_COMMAND} from '@lexical/react/LexicalHorizontalRuleNode';
import {$isHeadingNode} from '@lexical/rich-text';
import {$isParentElementRTL} from '@lexical/selection';
import {INSERT_TABLE_COMMAND} from '@lexical/table';
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  $isEditorIsNestedEditor,
  mergeRegister,
} from '@lexical/utils';
import {
  IconList,
  IconListNumbers,
  IconH1,
  IconH2,
  IconH3,
  IconAlignJustified as IconParagraph,
  IconBold,
  IconItalic,
  IconUnderline,
  IconLink,
  IconSuperscript,
  IconSubscript,
  IconChevronDown,
  IconStrikethrough,
  IconH4,
  IconH5,
  IconPuzzle,
  IconCode,
  IconQuote,
  IconSeparatorHorizontal,
  IconTable,
  IconClearFormatting,
  IconPhoto,
  IconBracketsAngle,
  IconCube,
  IconCapsuleHorizontal,
  IconTextSize,
  IconSearch,
} from '@tabler/icons-preact';
import {
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';

import {ComponentChildren} from 'preact';
import {
  Dispatch,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'preact/compat';
import * as schema from '../../../../../../../core/schema.js';
import {
  normalizeRichTextParagraphSizes,
  RichTextParagraphSize,
  RichTextParagraphSizeOption,
} from '../../../../../../../shared/richtext.js';
import {Button} from '../../../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../../../primitives/IconButton/IconButton.js';
import {
  Menu,
  MenuGroup,
  MenuItem,
} from '../../../../../../primitives/Menu/Menu.js';
import {TextInput} from '../../../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../../../utils/classes.js';
import {
  TOOLBAR_BLOCK_LABELS,
  ToolbarBlockType,
  useToolbar,
} from '../hooks/useToolbar.js';
import {$getParagraphSize} from '../nodes/SizedParagraphNode.js';
import {getSelectedNode} from '../utils/selection.js';
import {SHORTCUTS} from '../utils/shortcuts.js';
import {
  formatBulletList,
  formatHeading,
  formatNumberedList,
  formatParagraph,
  formatBlockquote,
  clearFormatting,
} from '../utils/toolbar.js';
import {sanitizeUrl} from '../utils/url.js';

/**
 * Number of custom components at which the components dropdown starts offering
 * a filter input.
 */
const COMPONENT_FILTER_MIN_COMPONENTS = 8;

/**
 * Classes for the toolbar's dropdown buttons (block type and components),
 * matching the compact Mantine buttons they replace.
 */
const DROPDOWN_BUTTON_CLASSES =
  'LexicalEditor__toolbar__dropdown shrink-0 tracking-wider';

/**
 * Classes for a pressed (active) toolbar icon button: Mantine's light blue.
 */
const ACTIVE_ICON_CLASSES =
  'aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-hover';

/**
 * Joins a row of icon buttons into one segmented control: square inner
 * corners and shared borders.
 */
const GROUP_CLASSES =
  'LexicalEditor__toolbar__group flex shrink-0 *:rounded-none *:first:rounded-l-sm *:last:rounded-r-sm *:not-first:border-l-0';

/** Returns the menu item elements of the dropdown that contains `element`. */
function getMenuItems(element: HTMLElement): HTMLElement[] {
  const menu = element.closest('[role="menu"]');
  if (!menu) {
    return [];
  }
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])'
    )
  );
}

interface BlockTypeIconProps {
  blockType: ToolbarBlockType;
}

function BlockTypeIcon(props: BlockTypeIconProps) {
  const {blockType} = props;
  if (blockType === 'paragraph') {
    return <IconParagraph size={16} />;
  }
  if (blockType === 'h1') {
    return <IconH1 size={16} />;
  }
  if (blockType === 'h2') {
    return <IconH2 size={16} />;
  }
  if (blockType === 'h3') {
    return <IconH3 size={16} />;
  }
  if (blockType === 'h4') {
    return <IconH4 size={16} />;
  }
  if (blockType === 'h5') {
    return <IconH5 size={16} />;
  }
  if (blockType === 'number') {
    return <IconListNumbers size={16} />;
  }
  if (blockType === 'bullet') {
    return <IconList size={16} />;
  }
  if (blockType === 'quote') {
    return <IconQuote size={16} />;
  }
  return null;
}

interface BlockFormatDropDownProps {
  blockType: ToolbarBlockType;
  rootType: 'root' | 'table';
  editor: LexicalEditor;
  disabled?: boolean;
  /** Paragraph sizes declared by the field's schema. */
  paragraphSizes?: Array<RichTextParagraphSizeOption | string>;
  /** Size of the currently selected paragraph, if it has one. */
  paragraphSize?: RichTextParagraphSize;
}

function BlockFormatDropDown(props: BlockFormatDropDownProps) {
  const {editor, blockType, paragraphSize} = props;
  const paragraphSizes = useMemo(
    () => normalizeRichTextParagraphSizes(props.paragraphSizes),
    [props.paragraphSizes]
  );
  // A paragraph can carry a size the field doesn't declare (e.g. pasted from a
  // field that does), so fall back to the raw value rather than mislabeling it
  // as "Normal".
  const label = paragraphSize
    ? paragraphSizes.find((option) => option.value === paragraphSize)?.label ||
      paragraphSize
    : TOOLBAR_BLOCK_LABELS[blockType];
  return (
    <Menu
      label="Block type"
      trigger={
        <Button
          className={cn(
            DROPDOWN_BUTTON_CLASSES,
            'LexicalEditor__toolbar__blockFormatDropdown'
          )}
          icon={
            paragraphSize ? (
              <IconTextSize size={16} />
            ) : (
              <BlockTypeIcon blockType={blockType} />
            )
          }
          iconRight={<IconChevronDown size={16} />}
        >
          {label}
        </Button>
      }
    >
      <MenuItem
        icon={<BlockTypeIcon blockType="paragraph" />}
        aria-current={
          (blockType === 'paragraph' && !paragraphSize) || undefined
        }
        onClick={() => formatParagraph(editor)}
      >
        Normal
      </MenuItem>
      {paragraphSizes.map((option) => (
        <MenuItem
          key={option.value}
          icon={<IconTextSize size={16} />}
          aria-current={paragraphSize === option.value || undefined}
          onClick={() => formatParagraph(editor, option.value)}
        >
          {option.label}
        </MenuItem>
      ))}
      <MenuItem
        icon={<BlockTypeIcon blockType="bullet" />}
        aria-current={blockType === 'bullet' || undefined}
        onClick={() => formatBulletList(editor, blockType)}
      >
        Bullet List
      </MenuItem>
      <MenuItem
        icon={<BlockTypeIcon blockType="number" />}
        aria-current={blockType === 'number' || undefined}
        onClick={() => formatNumberedList(editor, blockType)}
      >
        Numbered List
      </MenuItem>
      <MenuItem
        icon={<BlockTypeIcon blockType="h1" />}
        aria-current={blockType === 'h1' || undefined}
        onClick={() => formatHeading(editor, blockType, 'h1')}
      >
        Heading 1
      </MenuItem>
      <MenuItem
        icon={<BlockTypeIcon blockType="h2" />}
        aria-current={blockType === 'h2' || undefined}
        onClick={() => formatHeading(editor, blockType, 'h2')}
      >
        Heading 2
      </MenuItem>
      <MenuItem
        icon={<BlockTypeIcon blockType="h3" />}
        aria-current={blockType === 'h3' || undefined}
        onClick={() => formatHeading(editor, blockType, 'h3')}
      >
        Heading 3
      </MenuItem>
      <MenuItem
        icon={<BlockTypeIcon blockType="h4" />}
        aria-current={blockType === 'h4' || undefined}
        onClick={() => formatHeading(editor, blockType, 'h4')}
      >
        Heading 4
      </MenuItem>
      <MenuItem
        icon={<BlockTypeIcon blockType="h5" />}
        aria-current={blockType === 'h5' || undefined}
        onClick={() => formatHeading(editor, blockType, 'h5')}
      >
        Heading 5
      </MenuItem>
      <MenuItem
        icon={<BlockTypeIcon blockType="quote" />}
        aria-current={blockType === 'quote' || undefined}
        onClick={() => formatBlockquote(editor, blockType)}
      >
        Quote
      </MenuItem>
    </Menu>
  );
}

/** Spacing between groups of toolbar controls. */
function Divider() {
  return (
    <div className="LexicalEditor__toolbar__divider shrink-0" aria-hidden />
  );
}

interface MoreFormattingDropdownProps {
  editor: LexicalEditor;
  isStrikethrough: boolean;
  isSuperscript: boolean;
  isSubscript: boolean;
  isCode: boolean;
}

function MoreFormattingDropdown(props: MoreFormattingDropdownProps) {
  const {editor, isStrikethrough, isSuperscript, isSubscript, isCode} = props;
  const isAnyActive = isStrikethrough || isSuperscript || isSubscript || isCode;

  return (
    <Menu
      className="min-w-60"
      trigger={
        <IconButton
          label="More formatting"
          variant="default"
          className={cn(
            'LexicalEditor__toolbar__actionIcon',
            isAnyActive &&
              'LexicalEditor__toolbar__actionIcon--active bg-button-blue-soft text-button-blue-hover'
          )}
        >
          <IconChevronDown />
        </IconButton>
      }
    >
      <MenuItem
        icon={<IconStrikethrough />}
        aria-current={isStrikethrough || undefined}
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
        }}
      >
        Strikethrough ({SHORTCUTS.STRIKETHROUGH})
      </MenuItem>
      <MenuItem
        icon={<IconSuperscript />}
        aria-current={isSuperscript || undefined}
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript');
        }}
      >
        Superscript ({SHORTCUTS.SUPERSCRIPT})
      </MenuItem>
      <MenuItem
        icon={<IconSubscript />}
        aria-current={isSubscript || undefined}
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript');
        }}
      >
        Subscript ({SHORTCUTS.SUBSCRIPT})
      </MenuItem>
      <MenuItem
        icon={<IconCode />}
        aria-current={isCode || undefined}
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
        }}
      >
        Code
      </MenuItem>
    </Menu>
  );
}

interface ToolbarPluginProps {
  editor: LexicalEditor;
  activeEditor: LexicalEditor;
  setActiveEditor: Dispatch<LexicalEditor>;
  setIsLinkEditMode: Dispatch<boolean>;
  variant?: 'document' | 'comment';
  blockComponents?: schema.Schema[];
  onInsertBlockComponent?: (blockName: string) => void;
  inlineComponents?: schema.Schema[];
  onInsertInlineComponent?: (componentName: string) => void;
  /** Paragraph sizes declared by the field's schema. */
  paragraphSizes?: Array<RichTextParagraphSizeOption | string>;
}

export function ToolbarPlugin(props: ToolbarPluginProps) {
  const {
    editor,
    blockComponents,
    inlineComponents,
    activeEditor,
    setActiveEditor,
    setIsLinkEditMode,
    variant = 'document',
    onInsertBlockComponent,
    onInsertInlineComponent,
    paragraphSizes,
  } = props;
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());
  const {toolbarState, updateToolbarState} = useToolbar();

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      if (activeEditor !== editor && $isEditorIsNestedEditor(activeEditor)) {
        const rootElement = activeEditor.getRootElement();
        updateToolbarState(
          'isImageCaption',
          !!rootElement?.parentElement?.classList.contains(
            'image-caption-container'
          )
        );
      } else {
        updateToolbarState('isImageCaption', false);
      }

      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow();
      }

      const elementKey = element.getKey();
      const elementDOM = activeEditor.getElementByKey(elementKey);

      updateToolbarState('isRTL', $isParentElementRTL(selection));

      // Update links
      const node = getSelectedNode(selection);
      const parent = node.getParent();
      const isLink = $isLinkNode(parent) || $isLinkNode(node);
      updateToolbarState('isLink', isLink);
      updateToolbarState('rootType', 'root');

      if (elementDOM !== null) {
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(
            anchorNode,
            ListNode
          );
          const type = parentList
            ? parentList.getListType()
            : element.getListType();

          updateToolbarState('blockType', type as ToolbarBlockType);
          updateToolbarState('paragraphSize', undefined);
        } else if ($isParagraphNode(element)) {
          // A sized paragraph is a `ParagraphNode` subclass with its own node
          // type, so it would never match `TOOLBAR_BLOCK_LABELS` and would
          // leave the dropdown showing whatever block was selected before.
          updateToolbarState('blockType', 'paragraph');
          updateToolbarState('paragraphSize', $getParagraphSize(element));
        } else {
          updateToolbarState('paragraphSize', undefined);
          const type = $isHeadingNode(element)
            ? element.getTag()
            : element.getType();
          if (type in TOOLBAR_BLOCK_LABELS) {
            updateToolbarState('blockType', type as ToolbarBlockType);
          }
        }
      }
      // Handle buttons
      let matchingParent;
      if ($isLinkNode(parent)) {
        // If node is a link, we need to fetch the parent paragraph node to set format
        matchingParent = $findMatchingParent(
          node,
          (parentNode) => $isElementNode(parentNode) && !parentNode.isInline()
        );
      }

      // If matchingParent is a valid node, pass it's format type
      updateToolbarState(
        'elementFormat',
        $isElementNode(matchingParent)
          ? matchingParent.getFormatType()
          : $isElementNode(node)
            ? node.getFormatType()
            : parent?.getFormatType() || 'left'
      );
    }
    if ($isRangeSelection(selection)) {
      // Update text format
      updateToolbarState('isBold', selection.hasFormat('bold'));
      updateToolbarState('isItalic', selection.hasFormat('italic'));
      updateToolbarState('isUnderline', selection.hasFormat('underline'));
      updateToolbarState(
        'isStrikethrough',
        selection.hasFormat('strikethrough')
      );
      updateToolbarState('isSuperscript', selection.hasFormat('superscript'));
      updateToolbarState('isSubscript', selection.hasFormat('subscript'));
      updateToolbarState('isCode', selection.hasFormat('code'));
    }
  }, [activeEditor, editor, updateToolbarState]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        setActiveEditor(newEditor);
        $updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor, $updateToolbar, setActiveEditor]);

  useEffect(() => {
    // The `{editor}` option is required so that lexical helpers that read from
    // the DOM (e.g. `$isParentElementRTL()`) can resolve the active editor.
    activeEditor.getEditorState().read(
      () => {
        $updateToolbar();
      },
      {editor: activeEditor}
    );
  }, [activeEditor, $updateToolbar]);

  useEffect(() => {
    return mergeRegister(
      editor.registerEditableListener((editable) => {
        setIsEditable(editable);
      }),
      activeEditor.registerUpdateListener(({editorState}) => {
        editorState.read(
          () => {
            $updateToolbar();
          },
          {editor: activeEditor}
        );
      }),
      activeEditor.registerCommand<boolean>(
        CAN_UNDO_COMMAND,
        (payload) => {
          updateToolbarState('canUndo', payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          updateToolbarState('canRedo', payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [$updateToolbar, activeEditor, editor, updateToolbarState]);

  const insertLink = useCallback(() => {
    if (!toolbarState.isLink) {
      setIsLinkEditMode(true);
      activeEditor.dispatchCommand(
        TOGGLE_LINK_COMMAND,
        sanitizeUrl('https://')
      );
    } else {
      setIsLinkEditMode(false);
      activeEditor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [activeEditor, setIsLinkEditMode, toolbarState.isLink]);

  const sortedBlockComponents = useMemo(() => {
    if (!blockComponents) {
      return [] as schema.Schema[];
    }
    return [...blockComponents].sort((a, b) => {
      const aLabel = a.label || a.name;
      const bLabel = b.label || b.name;
      return aLabel.localeCompare(bLabel);
    });
  }, [blockComponents]);

  const sortedInlineComponents = useMemo(() => {
    if (!inlineComponents) {
      return [] as schema.Schema[];
    }
    return [...inlineComponents].sort((a, b) => {
      const aLabel = a.label || a.name;
      const bLabel = b.label || b.name;
      return aLabel.localeCompare(bLabel);
    });
  }, [inlineComponents]);

  const [componentsMenuOpened, setComponentsMenuOpened] = useState(false);
  const [componentFilter, setComponentFilter] = useState('');

  // Focus the filter as soon as it mounts, i.e. when the menu opens. The menu
  // focuses its first item once it's positioned, a render later, so take focus
  // back from that one move.
  const componentFilterRef = useCallback((input: HTMLInputElement | null) => {
    if (!input) {
      return;
    }
    input.focus();
    const menu = input.closest('[role="menu"]');
    if (!menu) {
      return;
    }
    const reclaimFocus = (e: Event) => {
      menu.removeEventListener('focusin', reclaimFocus);
      if (e.target !== input) {
        input.focus({preventScroll: true});
      }
    };
    menu.addEventListener('focusin', reclaimFocus);
    window.setTimeout(() => menu.removeEventListener('focusin', reclaimFocus));
  }, []);

  // Only offer the filter input once the list is long enough to be worth
  // searching.
  const showComponentFilter =
    sortedInlineComponents.length + sortedBlockComponents.length >=
    COMPONENT_FILTER_MIN_COMPONENTS;

  const filterQuery = componentFilter.trim().toLowerCase();
  const matchesComponentFilter = (...values: Array<string | undefined>) => {
    if (!filterQuery) {
      return true;
    }
    return values.some((value) => value?.toLowerCase().includes(filterQuery));
  };

  const filteredInlineComponents = sortedInlineComponents.filter((component) =>
    matchesComponentFilter(component.label, component.name)
  );
  const filteredBlockComponents = sortedBlockComponents.filter((block) =>
    matchesComponentFilter(block.label, block.name)
  );
  const showTableItem = matchesComponentFilter('Table');
  const showHorizontalRuleItem = matchesComponentFilter('Horizontal Rule');
  const hasFilterResults =
    showTableItem ||
    showHorizontalRuleItem ||
    filteredInlineComponents.length > 0 ||
    filteredBlockComponents.length > 0;

  // The menu moves into its items on ArrowDown, and closes on Escape.
  const onComponentFilterKeyDown = (event: KeyboardEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      getMenuItems(input)[0]?.click();
    }
  };

  const onComponentsMenuOpenChange = (open: boolean) => {
    if (open) {
      setComponentFilter('');
      setComponentsMenuOpened(true);
      return;
    }
    // Escape clears the query first so that it doesn't discard a long search
    // by accident; a second Escape closes the menu. The menu handles Escape
    // before the input sees it, so check the event that's closing it.
    const event = window.event;
    if (
      componentFilter &&
      event instanceof KeyboardEvent &&
      event.key === 'Escape'
    ) {
      setComponentFilter('');
      return;
    }
    setComponentsMenuOpened(false);
  };

  const getComponentIcon = (componentName: string) => {
    switch (componentName) {
      case 'image':
        return <IconPhoto />;
      case 'html':
        return <IconBracketsAngle />;
      default:
        break;
    }
    return <IconCube />;
  };
  const isCommentVariant = variant === 'comment';

  return (
    <div
      className={cn(
        'LexicalEditor__toolbar',
        isCommentVariant && 'LexicalEditor__toolbar--comment'
      )}
    >
      {!isCommentVariant &&
        toolbarState.blockType in TOOLBAR_BLOCK_LABELS &&
        activeEditor === editor && (
          <>
            <BlockFormatDropDown
              disabled={!isEditable}
              blockType={toolbarState.blockType}
              rootType={toolbarState.rootType}
              editor={activeEditor}
              paragraphSizes={paragraphSizes}
              paragraphSize={toolbarState.paragraphSize}
            />
            <Divider />
          </>
        )}
      <>
        <div className={GROUP_CLASSES}>
          <ToolbarActionIcon
            tooltip={`Bold (${SHORTCUTS.BOLD})`}
            active={toolbarState.isBold}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            }}
          >
            <IconBold />
          </ToolbarActionIcon>
          <ToolbarActionIcon
            tooltip={`Italic (${SHORTCUTS.ITALIC})`}
            active={toolbarState.isItalic}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
            }}
          >
            <IconItalic />
          </ToolbarActionIcon>
          <ToolbarActionIcon
            tooltip={`Underline (${SHORTCUTS.UNDERLINE})`}
            active={toolbarState.isUnderline}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
            }}
          >
            <IconUnderline />
          </ToolbarActionIcon>
          <MoreFormattingDropdown
            editor={activeEditor}
            isStrikethrough={toolbarState.isStrikethrough}
            isSuperscript={toolbarState.isSuperscript}
            isSubscript={toolbarState.isSubscript}
            isCode={toolbarState.isCode}
          />
        </div>

        <Divider />

        <ToolbarActionIcon
          tooltip={`Insert link (${SHORTCUTS.INSERT_LINK})`}
          active={toolbarState.isLink}
          onClick={insertLink}
        >
          <IconLink />
        </ToolbarActionIcon>

        <Divider />

        <ToolbarActionIcon
          tooltip={`Clear formatting (${SHORTCUTS.CLEAR_FORMATTING})`}
          onClick={() => {
            clearFormatting(activeEditor);
          }}
        >
          <IconClearFormatting />
        </ToolbarActionIcon>

        <Divider />

        {!isCommentVariant && (
          <>
            <Menu
              className="LexicalEditor__toolbar__insertDropdown__body w-70"
              open={componentsMenuOpened}
              onOpenChange={onComponentsMenuOpenChange}
              trigger={
                <Button
                  className={cn(
                    DROPDOWN_BUTTON_CLASSES,
                    'LexicalEditor__toolbar__insertDropdown'
                  )}
                  icon={<IconPuzzle />}
                  iconRight={<IconChevronDown />}
                >
                  Components
                </Button>
              }
            >
              {showComponentFilter && (
                <div className="LexicalEditor__toolbar__insertDropdown__filter sticky -top-1 z-10 -mx-1 -mt-1 mb-1 border-0 border-b border-solid border-border bg-surface p-1.5">
                  <TextInput
                    ref={componentFilterRef}
                    leftSection={<IconSearch />}
                    placeholder="Search components"
                    aria-label="Search components"
                    value={componentFilter}
                    onInput={(event) =>
                      setComponentFilter(event.currentTarget.value)
                    }
                    onKeyDown={onComponentFilterKeyDown}
                  />
                </div>
              )}
              {(showTableItem || showHorizontalRuleItem) && (
                <MenuGroup label="Insert">
                  {showTableItem && (
                    <MenuItem
                      icon={<IconTable />}
                      onClick={() => {
                        activeEditor.dispatchCommand(INSERT_TABLE_COMMAND, {
                          columns: '3',
                          rows: '3',
                        });
                      }}
                    >
                      Table
                    </MenuItem>
                  )}
                  {showHorizontalRuleItem && (
                    <MenuItem
                      icon={<IconSeparatorHorizontal />}
                      onClick={() => {
                        activeEditor.dispatchCommand(
                          INSERT_HORIZONTAL_RULE_COMMAND,
                          undefined
                        );
                      }}
                    >
                      Horizontal Rule
                    </MenuItem>
                  )}
                </MenuGroup>
              )}
              {filteredInlineComponents.length > 0 && (
                <MenuGroup label="Inline Components">
                  {filteredInlineComponents.map((component) => (
                    <MenuItem
                      key={component.name}
                      icon={<IconCapsuleHorizontal />}
                      title={component.label || component.name}
                      onClick={() => onInsertInlineComponent?.(component.name)}
                    >
                      <span className="block truncate">
                        {component.label || component.name}
                      </span>
                    </MenuItem>
                  ))}
                </MenuGroup>
              )}
              {filteredBlockComponents.length > 0 && (
                <MenuGroup label="Block Components">
                  {filteredBlockComponents.map((block) => (
                    <MenuItem
                      key={block.name}
                      icon={getComponentIcon(block.name)}
                      title={block.label || block.name}
                      onClick={() => onInsertBlockComponent?.(block.name)}
                    >
                      <span className="block truncate">
                        {block.label || block.name}
                      </span>
                    </MenuItem>
                  ))}
                </MenuGroup>
              )}
              {!hasFilterResults && (
                <div className="LexicalEditor__toolbar__insertDropdown__empty px-3 py-2 text-sm text-muted">
                  No components found.
                </div>
              )}
            </Menu>
            <Divider />
          </>
        )}
      </>
    </div>
  );
}

export interface ToolbarActionIconProps {
  /** `default` (bordered, the toolbar) or `subtle` (the floating toolbar). */
  variant?: 'default' | 'subtle';
  active?: boolean;
  tooltip: string;
  onClick?: () => void;
  className?: string;
  children?: ComponentChildren;
}

/**
 * A formatting button in the toolbars: an icon button whose `tooltip` is also
 * its accessible name, pressed (blue) while its format is active.
 */
export function ToolbarActionIcon(props: ToolbarActionIconProps) {
  return (
    <IconButton
      label={props.tooltip}
      variant={props.variant || 'default'}
      pressed={props.active}
      onClick={props.onClick}
      className={cn(
        'LexicalEditor__toolbar__actionIcon',
        props.active && 'LexicalEditor__toolbar__actionIcon--active',
        ACTIVE_ICON_CLASSES,
        props.className
      )}
    >
      {props.children}
    </IconButton>
  );
}
