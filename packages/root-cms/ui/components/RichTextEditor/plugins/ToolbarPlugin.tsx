import {ActionIcon, ActionIconVariant, Button, Menu, Tooltip} from '@mantine/core';
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
  IconPhoto,
  IconBrandYoutube,
  IconMovie,
  IconCode,
  IconStrikethrough,
} from '@tabler/icons-preact';
import {$isLinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link';
import {$isListNode, ListNode} from '@lexical/list';
import {INSERT_EMBED_COMMAND} from '@lexical/react/LexicalAutoEmbedPlugin';
import {$isHeadingNode} from '@lexical/rich-text';
import {
  $isParentElementRTL,
} from '@lexical/selection';
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  $isEditorIsNestedEditor,
  mergeRegister,
} from '@lexical/utils';
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
  NodeKey,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {Dispatch, useCallback, useEffect, useState} from 'preact/compat';
import * as schema from '../../../../core/schema.js';

// import useModal from '../../hooks/useModal';
// import DropDown, {DropDownItem} from '../../ui/DropDown';
import {getSelectedNode} from '../utils/selection.js';
import {sanitizeUrl} from '../utils/url.js';
// import {EmbedConfigs} from './AutoEmbedPlugin.js';
// import {
//   InsertImageDialog,
// } from './ImagesPlugin.js';
import {
  clearFormatting,
  formatBulletList,
  formatHeading,
  formatNumberedList,
  formatParagraph,
} from '../utils/toolbar.js';
import {SHORTCUTS} from '../utils/shortcuts.js';
import {TOOLBAR_BLOCK_LABELS, ToolbarBlockType, useToolbar} from '../hooks/useToolbar.js';
import {joinClassNames} from '../../../utils/classes.js';
import {ComponentChildren} from 'preact';
import {useEmbedModal} from '../components/EmbedModal/EmbedModal.js';

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
  const {editor, blockType, rootType, disabled = false} = props;
  return (
    <Menu
      control={
        <Button
          className={joinClassNames('LexicalEditor__toolbar__dropdown', 'LexicalEditor__toolbar__blockFormatDropdown')}
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
        icon={<BlockTypeIcon blockType="h1" />}
        className={dropDownActiveClass(blockType === 'h1')}
        onClick={() => formatHeading(editor, blockType, 'h1')}>
        Heading 1
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="h2" />}
        className={dropDownActiveClass(blockType === 'h2')}
        onClick={() => formatHeading(editor, blockType, 'h2')}>
        Heading 2
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="h3" />}
        className={dropDownActiveClass(blockType === 'h3')}
        onClick={() => formatHeading(editor, blockType, 'h3')}>
        Heading 3
      </Menu.Item>
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
        onClick={() => formatBulletList(editor, blockType)}>
        Bullet List
      </Menu.Item>
      <Menu.Item
        icon={<BlockTypeIcon blockType="number" />}
        className={dropDownActiveClass(blockType === 'number')}
        onClick={() => formatNumberedList(editor, blockType)}>
        Numbered List
      </Menu.Item>
    </Menu>
  );
}

function InsertDropdown() {
  const embedModal = useEmbedModal();

  return (
    <Menu
      control={
        <Button
          className={joinClassNames('LexicalEditor__toolbar__dropdown', 'LexicalEditor__toolbar__insertDropdown')}
          variant="default"
          compact
          rightIcon={<IconChevronDown size={16} />}
        >
          Embed
        </Button>
      }
    >
      <Menu.Item
        icon={<IconCode size={16} />}
        onClick={() => {
          embedModal.open({
            title: 'Embed: HTML',
            schema: INSERT_HTML_SCHEMA,
            onSave: (value) => {
              console.log('onSave()');
              console.log(value);
            },
          });
        }}
      >
        HTML Code
      </Menu.Item>
      <Menu.Item icon={<IconPhoto size={16} />}>
        Image
      </Menu.Item>
      <Menu.Item icon={<IconMovie size={16} />}>
        Video (.mp4)
      </Menu.Item>
      <Menu.Item icon={<IconBrandYoutube size={16} />}>
        YouTube
      </Menu.Item>
    </Menu>
  );
}

const INSERT_HTML_SCHEMA = schema.define({
  name: 'InsertHTML',
  fields: [
    schema.string({
      id: 'html',
      label: 'HTML',
      help: 'HTML code to embed. Please use caution when embedding HTML.',
      variant: 'textarea',
    }),
  ],
});

function Divider() {
  return <div className="divider" />;
}

interface ToolbarPluginProps {
  editor: LexicalEditor;
  activeEditor: LexicalEditor;
  setActiveEditor: Dispatch<LexicalEditor>;
  setIsLinkEditMode: Dispatch<boolean>;
}

export function ToolbarPlugin(props: ToolbarPluginProps) {
  const {
    editor,
    activeEditor,
    setActiveEditor,
    setIsLinkEditMode,
  } = props;
  const [selectedElementKey, setSelectedElementKey] = useState<NodeKey | null>(
    null,
  );
  // const [modal, showModal] = useModal();
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
            'image-caption-container',
          ),
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
        setSelectedElementKey(elementKey);
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(
            anchorNode,
            ListNode,
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
            updateToolbarState(
              'blockType',
              type as ToolbarBlockType,
            );
          }
        }
      }
      // Handle buttons
      let matchingParent;
      if ($isLinkNode(parent)) {
        // If node is a link, we need to fetch the parent paragraph node to set format
        matchingParent = $findMatchingParent(
          node,
          (parentNode) => $isElementNode(parentNode) && !parentNode.isInline(),
        );
      }

      // If matchingParent is a valid node, pass it's format type
      updateToolbarState(
        'elementFormat',
        $isElementNode(matchingParent)
          ? matchingParent.getFormatType()
          : $isElementNode(node)
          ? node.getFormatType()
          : parent?.getFormatType() || 'left',
      );
    }
    if ($isRangeSelection(selection)) {
      // Update text format
      updateToolbarState('isBold', selection.hasFormat('bold'));
      updateToolbarState('isItalic', selection.hasFormat('italic'));
      updateToolbarState('isUnderline', selection.hasFormat('underline'));
      updateToolbarState(
        'isStrikethrough',
        selection.hasFormat('strikethrough'),
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
      COMMAND_PRIORITY_CRITICAL,
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
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          updateToolbarState('canRedo', payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [$updateToolbar, activeEditor, editor, updateToolbarState]);

  const insertLink = useCallback(() => {
    if (!toolbarState.isLink) {
      setIsLinkEditMode(true);
      activeEditor.dispatchCommand(
        TOGGLE_LINK_COMMAND,
        sanitizeUrl('https://'),
      );
    } else {
      setIsLinkEditMode(false);
      activeEditor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [activeEditor, setIsLinkEditMode, toolbarState.isLink]);

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
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
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

        <InsertDropdown />

        {/* <button
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
          }}
          className={
            'toolbar-item spaced ' + (toolbarState.isItalic ? 'active' : '')
          }
          title={`Italic (${SHORTCUTS.ITALIC})`}
          type="button"
          aria-label={`Format text as italics. Shortcut: ${SHORTCUTS.ITALIC}`}>
          <IconItalic size={16} />
        </button> */}
        {/* <button
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
          }}
          className={
            'toolbar-item spaced ' +
            (toolbarState.isUnderline ? 'active' : '')
          }
          title={`Underline (${SHORTCUTS.UNDERLINE})`}
          type="button"
          aria-label={`Format text to underlined. Shortcut: ${SHORTCUTS.UNDERLINE}`}>
          <IconUnderline size={16} />
        </button> */}
        {/* <button
          disabled={!isEditable}
          onClick={insertLink}
          className={
            'toolbar-item spaced ' + (toolbarState.isLink ? 'active' : '')
          }
          aria-label="Insert link"
          title={`Insert link (${SHORTCUTS.INSERT_LINK})`}
          type="button">
          <IconLink size={16} />
        </button> */}
        {/* <DropDown
          disabled={!isEditable}
          buttonClassName="toolbar-item spaced"
          buttonLabel=""
          buttonAriaLabel="Formatting options for additional text styles"
          buttonIconClassName="icon dropdown-more">
          <DropDownItem
            onClick={() => {
              activeEditor.dispatchCommand(
                FORMAT_TEXT_COMMAND,
                'strikethrough',
              );
            }}
            className={
              'item wide ' + dropDownActiveClass(toolbarState.isStrikethrough)
            }
            title="Strikethrough"
            aria-label="Format text with a strikethrough">
            <div className="icon-text-container">
              <i className="icon strikethrough" />
              <span className="text">Strikethrough</span>
            </div>
            <span className="shortcut">{SHORTCUTS.STRIKETHROUGH}</span>
          </DropDownItem>
          <DropDownItem
            onClick={() => {
              activeEditor.dispatchCommand(
                FORMAT_TEXT_COMMAND,
                'superscript',
              );
            }}
            className={
              'item wide ' + dropDownActiveClass(toolbarState.isSuperscript)
            }
            title="Superscript"
            aria-label="Format text with a superscript">
            <div className="icon-text-container">
              <i className="icon superscript" />
              <span className="text">Superscript</span>
            </div>
            <span className="shortcut">{SHORTCUTS.SUPERSCRIPT}</span>
          </DropDownItem>
          <DropDownItem
            onClick={() => clearFormatting(activeEditor)}
            className="item wide"
            title="Clear text formatting"
            aria-label="Clear all text formatting">
            <div className="icon-text-container">
              <i className="icon clear" />
              <span className="text">Clear Formatting</span>
            </div>
            <span className="shortcut">{SHORTCUTS.CLEAR_FORMATTING}</span>
          </DropDownItem>
        </DropDown> */}
        {/* {canViewerSeeInsertDropdown && (
          <>
            <Divider />
            <DropDown
              disabled={!isEditable}
              buttonClassName="toolbar-item spaced"
              buttonLabel="Insert"
              buttonAriaLabel="Insert specialized editor node"
              buttonIconClassName="icon plus">
              <DropDownItem
                onClick={() => {
                  showModal('Insert Image', (onClose) => (
                    <InsertImageDialog
                      activeEditor={activeEditor}
                      onClose={onClose}
                    />
                  ));
                }}
                className="item">
                <i className="icon image" />
                <span className="text">Image</span>
              </DropDownItem>
              {EmbedConfigs.map((embedConfig) => (
                <DropDownItem
                  key={embedConfig.type}
                  onClick={() => {
                    activeEditor.dispatchCommand(
                      INSERT_EMBED_COMMAND,
                      embedConfig.type,
                    );
                  }}
                  className="item">
                  {embedConfig.icon}
                  <span className="text">{embedConfig.contentName}</span>
                </DropDownItem>
              ))}
            </DropDown>
          </>
        )} */}
      </>
      {/* {modal} */}
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
      className={joinClassNames('LexicalEditor__toolbar__actionIcon', props.active && 'LexicalEditor__toolbar__actionIcon--active')}
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
