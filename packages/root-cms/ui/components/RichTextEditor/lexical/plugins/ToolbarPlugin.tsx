import {$isLinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link';
import {$isListNode, ListNode} from '@lexical/list';
import {$isHeadingNode} from '@lexical/rich-text';
import {$isParentElementRTL} from '@lexical/selection';
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  $isEditorIsNestedEditor,
  mergeRegister,
} from '@lexical/utils';
import {
  ActionIcon,
  ActionIconVariant,
  Button,
  Menu,
  Tooltip,
} from '@mantine/core';
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
  IconChevronDown,
  IconStrikethrough,
  IconH4,
  IconH5,
  IconLayoutCollage,
} from '@tabler/icons-preact';
import {
  $getSelection,
  $isElementNode,
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
import * as schema from '../../../../../core/schema.js';
import {joinClassNames} from '../../../../utils/classes.js';
import {
  TOOLBAR_BLOCK_LABELS,
  ToolbarBlockType,
  useToolbar,
} from '../hooks/useToolbar.js';
import {getSelectedNode} from '../utils/selection.js';
import {SHORTCUTS} from '../utils/shortcuts.js';
import {
  formatBulletList,
  formatHeading,
  formatNumberedList,
  formatParagraph,
} from '../utils/toolbar.js';
import {sanitizeUrl} from '../utils/url.js';

const rootTypeToRootName = {
  root: 'Root',
  table: 'Table',
};

function dropDownActiveClass(active: boolean) {
  return active ? 'active dropdown-item-active' : '';
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
  return null;
}

interface BlockFormatDropDownProps {
  blockType: ToolbarBlockType;
  rootType: keyof typeof rootTypeToRootName;
  editor: LexicalEditor;
  disabled?: boolean;
}

function BlockFormatDropDown(props: BlockFormatDropDownProps) {
  const {editor, blockType} = props;
  return (
    <Menu
      control={
        <Button
          className={joinClassNames(
            'LexicalEditor__toolbar__dropdown',
            'LexicalEditor__toolbar__blockFormatDropdown'
          )}
          variant="default"
          compact
          leftIcon={<BlockTypeIcon blockType={blockType} />}
          rightIcon={<IconChevronDown size={16} />}
        >
          {TOOLBAR_BLOCK_LABELS[blockType]}
        </Button>
      }
    >
      <Menu.Item
        icon={<BlockTypeIcon blockType="paragraph" />}
        className={dropDownActiveClass(blockType === 'paragraph')}
        onClick={() => formatParagraph(editor)}
      >
        Normal
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="bullet" />}
        className={dropDownActiveClass(blockType === 'bullet')}
        onClick={() => formatBulletList(editor, blockType)}
      >
        Bullet List
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="number" />}
        className={dropDownActiveClass(blockType === 'number')}
        onClick={() => formatNumberedList(editor, blockType)}
      >
        Numbered List
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="h1" />}
        className={dropDownActiveClass(blockType === 'h1')}
        onClick={() => formatHeading(editor, blockType, 'h1')}
      >
        Heading 1
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="h2" />}
        className={dropDownActiveClass(blockType === 'h2')}
        onClick={() => formatHeading(editor, blockType, 'h2')}
      >
        Heading 2
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="h3" />}
        className={dropDownActiveClass(blockType === 'h3')}
        onClick={() => formatHeading(editor, blockType, 'h3')}
      >
        Heading 3
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="h4" />}
        className={dropDownActiveClass(blockType === 'h4')}
        onClick={() => formatHeading(editor, blockType, 'h4')}
      >
        Heading 4
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="h5" />}
        className={dropDownActiveClass(blockType === 'h5')}
        onClick={() => formatHeading(editor, blockType, 'h5')}
      >
        Heading 5
      </Menu.Item>
    </Menu>
  );
}

function Divider() {
  return <div className="divider" />;
}

interface ToolbarPluginProps {
  editor: LexicalEditor;
  activeEditor: LexicalEditor;
  setActiveEditor: Dispatch<LexicalEditor>;
  setIsLinkEditMode: Dispatch<boolean>;
  customBlocks?: schema.Schema[];
  onInsertCustomBlock?: (blockName: string) => void;
}

export function ToolbarPlugin(props: ToolbarPluginProps) {
  const {
    editor,
    customBlocks,
    activeEditor,
    setActiveEditor,
    setIsLinkEditMode,
    onInsertCustomBlock,
  } = props;
  // const [selectedElementKey, setSelectedElementKey] = useState<NodeKey | null>(
  //   null
  // );
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
        // setSelectedElementKey(elementKey);
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(
            anchorNode,
            ListNode
          );
          const type = parentList
            ? parentList.getListType()
            : element.getListType();

          updateToolbarState('blockType', type as ToolbarBlockType);
        } else {
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
    activeEditor.getEditorState().read(() => {
      $updateToolbar();
    });
  }, [activeEditor, $updateToolbar]);

  useEffect(() => {
    return mergeRegister(
      editor.registerEditableListener((editable) => {
        setIsEditable(editable);
      }),
      activeEditor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          $updateToolbar();
        });
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

  const sortedCustomBlocks = useMemo(() => {
    if (!customBlocks) {
      return [] as schema.Schema[];
    }
    return [...customBlocks].sort((a, b) => {
      const aLabel = a.label || a.name;
      const bLabel = b.label || b.name;
      return aLabel.localeCompare(bLabel);
    });
  }, [customBlocks]);

  return (
    <div className="LexicalEditor__toolbar">
      {toolbarState.blockType in TOOLBAR_BLOCK_LABELS &&
        activeEditor === editor && (
          <>
            <BlockFormatDropDown
              disabled={!isEditable}
              blockType={toolbarState.blockType}
              rootType={toolbarState.rootType}
              editor={activeEditor}
            />
            <Divider />
          </>
        )}
      <>
        <div className="LexicalEditor__toolbar__group">
          <ToolbarActionIcon
            tooltip={`Bold (${SHORTCUTS.BOLD})`}
            active={toolbarState.isBold}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            }}
          >
            <IconBold size={16} />
          </ToolbarActionIcon>
          <ToolbarActionIcon
            tooltip={`Italic (${SHORTCUTS.ITALIC})`}
            active={toolbarState.isItalic}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
            }}
          >
            <IconItalic size={16} />
          </ToolbarActionIcon>
          <ToolbarActionIcon
            tooltip={`Underline (${SHORTCUTS.UNDERLINE})`}
            active={toolbarState.isUnderline}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
            }}
          >
            <IconUnderline size={16} />
          </ToolbarActionIcon>
          <ToolbarActionIcon
            tooltip={`Strikethrough (${SHORTCUTS.STRIKETHROUGH})`}
            active={toolbarState.isStrikethrough}
            onClick={() => {
              activeEditor.dispatchCommand(
                FORMAT_TEXT_COMMAND,
                'strikethrough'
              );
            }}
          >
            <IconStrikethrough size={16} />
          </ToolbarActionIcon>
          <ToolbarActionIcon
            tooltip={`Superscript (${SHORTCUTS.SUPERSCRIPT})`}
            active={toolbarState.isSuperscript}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript');
            }}
          >
            <IconSuperscript size={16} />
          </ToolbarActionIcon>
          <ToolbarActionIcon
            tooltip={`Insert link (${SHORTCUTS.INSERT_LINK})`}
            active={toolbarState.isLink}
            onClick={insertLink}
          >
            <IconLink size={16} />
          </ToolbarActionIcon>
        </div>

        <Divider />

        {sortedCustomBlocks.length > 0 && (
          <>
            <Menu
              control={
                <Button
                  className={joinClassNames(
                    'LexicalEditor__toolbar__dropdown',
                    'LexicalEditor__toolbar__insertDropdown'
                  )}
                  variant="default"
                  compact
                  rightIcon={<IconChevronDown size={16} />}
                  leftIcon={<IconLayoutCollage size={16} />}
                >
                  Blocks
                </Button>
              }
            >
              {sortedCustomBlocks.map((block) => (
                <Menu.Item
                  key={block.name}
                  onClick={() => onInsertCustomBlock?.(block.name)}
                >
                  {block.label || block.name}
                </Menu.Item>
              ))}
            </Menu>
            <Divider />
          </>
        )}
      </>
    </div>
  );
}

export interface ToolbarActionIconProps {
  variant?: ActionIconVariant;
  active?: boolean;
  tooltip?: string;
  onClick?: () => void;
  children?: ComponentChildren;
}

export function ToolbarActionIcon(props: ToolbarActionIconProps) {
  return (
    <Tooltip
      className={joinClassNames(
        'LexicalEditor__toolbar__actionIcon',
        props.active && 'LexicalEditor__toolbar__actionIcon--active'
      )}
      label={props.tooltip}
      position="top"
      withArrow
    >
      <ActionIcon
        variant={props.variant || 'default'}
        onClick={props.onClick}
        title={props.tooltip}
      >
        {props.children}
      </ActionIcon>
    </Tooltip>
  );
}
