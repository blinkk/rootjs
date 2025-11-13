import './FloatingLinkEditorPlugin.css';

import {
  $createLinkNode,
  $isAutoLinkNode,
  $isLinkNode,
  TOGGLE_LINK_COMMAND,
} from '@lexical/link';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$findMatchingParent, mergeRegister} from '@lexical/utils';
import {ActionIcon, Textarea, Tooltip} from '@mantine/core';
import {IconCheck, IconPencil, IconTrash, IconX} from '@tabler/icons-preact';
import {
  $getSelection,
  $isLineBreakNode,
  $isNodeSelection,
  $isRangeSelection,
  BaseSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  getDOMSelection,
  KEY_ESCAPE_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {ComponentChildren} from 'preact';
import {createPortal} from 'preact/compat';
import {Dispatch, useCallback, useEffect, useRef, useState} from 'preact/hooks';

import {joinClassNames} from '../../../../utils/classes.js';
import {getSelectedNode} from '../utils/selection.js';
import {sanitizeUrl} from '../utils/url.js';

const VERTICAL_GAP = 10;
const HORIZONTAL_OFFSET = 5;

interface FloatingLinkEditorProps {
  editor: LexicalEditor;
  isLink: boolean;
  setIsLink: Dispatch<boolean>;
  anchorElem: HTMLElement;
  isLinkEditMode: boolean;
  setIsLinkEditMode: Dispatch<boolean>;
}

function FloatingLinkEditor(props: FloatingLinkEditorProps) {
  const {
    editor,
    isLink,
    setIsLink,
    anchorElem,
    isLinkEditMode,
    setIsLinkEditMode,
  } = props;
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [editedLinkUrl, setEditedLinkUrl] = useState('');
  const [lastSelection, setLastSelection] = useState<BaseSelection | null>(
    null
  );

  const $updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const node = getSelectedNode(selection);
      const linkParent = $findMatchingParent(node, $isLinkNode);

      if (linkParent) {
        setLinkUrl(linkParent.getURL());
      } else if ($isLinkNode(node)) {
        setLinkUrl(node.getURL());
      } else {
        setLinkUrl('');
      }
      if (isLinkEditMode) {
        setEditedLinkUrl(normalizeUrl(linkUrl));
      }
    } else if ($isNodeSelection(selection)) {
      const nodes = selection.getNodes();
      if (nodes.length > 0) {
        const node = nodes[0];
        const parent = node.getParent();
        if ($isLinkNode(parent)) {
          setLinkUrl(parent.getURL());
        } else if ($isLinkNode(node)) {
          setLinkUrl(node.getURL());
        } else {
          setLinkUrl('');
        }
        if (isLinkEditMode) {
          setEditedLinkUrl(normalizeUrl(linkUrl));
        }
      }
    }

    const editorElem = editorRef.current;
    const nativeSelection = getDOMSelection(editor._window);
    const activeElement = document.activeElement;

    if (editorElem === null) {
      return;
    }

    const rootElement = editor.getRootElement();

    if (selection !== null && rootElement !== null && editor.isEditable()) {
      let domRect: DOMRect | undefined;

      if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes();
        if (nodes.length > 0) {
          const element = editor.getElementByKey(nodes[0].getKey());
          if (element) {
            domRect = element.getBoundingClientRect();
          }
        }
      } else if (
        nativeSelection !== null &&
        rootElement.contains(nativeSelection.anchorNode)
      ) {
        domRect =
          nativeSelection.focusNode?.parentElement?.getBoundingClientRect();
      }

      if (domRect) {
        domRect.y += 40;
        setFloatingElemPositionForLinkEditor(domRect, editorElem, anchorElem);
      }
      setLastSelection(selection);
    } else if (!activeElement || activeElement.className !== 'link-input') {
      if (rootElement !== null) {
        setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem);
      }
      setLastSelection(null);
      setIsLinkEditMode(false);
      setLinkUrl('');
    }

    return true;
  }, [anchorElem, editor, setIsLinkEditMode, isLinkEditMode, linkUrl]);

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement;

    const update = () => {
      editor.getEditorState().read(() => {
        $updateLinkEditor();
      });
    };

    window.addEventListener('resize', update);

    if (scrollerElem) {
      scrollerElem.addEventListener('scroll', update);
    }

    return () => {
      window.removeEventListener('resize', update);

      if (scrollerElem) {
        scrollerElem.removeEventListener('scroll', update);
      }
    };
  }, [anchorElem.parentElement, editor, $updateLinkEditor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          $updateLinkEditor();
        });
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateLinkEditor();
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isLink) {
            setIsLink(false);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, $updateLinkEditor, setIsLink, isLink]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      $updateLinkEditor();
    });
  }, [editor, $updateLinkEditor]);

  useEffect(() => {
    if (isLinkEditMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLinkEditMode, isLink]);

  const monitorInputInteraction = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLinkSubmission();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsLinkEditMode(false);
    }
  };

  const handleLinkSubmission = (e?: KeyboardEvent | MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (lastSelection !== null) {
      if (linkUrl !== null) {
        editor.update(() => {
          editor.dispatchCommand(
            TOGGLE_LINK_COMMAND,
            normalizeUrl(editedLinkUrl)
          );
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const parent = getSelectedNode(selection).getParent();
            if ($isAutoLinkNode(parent)) {
              const linkNode = $createLinkNode(parent.getURL(), {
                rel: parent.__rel,
                target: parent.__target,
                title: parent.__title,
              });
              parent.replace(linkNode, true);
            }
          }
        });
      }
      setEditedLinkUrl('');
      setIsLinkEditMode(false);
    }
  };

  return (
    <div
      ref={editorRef}
      className={joinClassNames(
        'LexicalEditor__linkEditor',
        !isLink && 'LexicalEditor__linkEditor--hidden'
      )}
    >
      {!isLink ? null : isLinkEditMode ? (
        <>
          <Textarea
            ref={inputRef}
            className="LexicalEditor__link__input"
            value={editedLinkUrl}
            onChange={(event: KeyboardEvent) => {
              const target = event.target as HTMLInputElement;
              setEditedLinkUrl(target.value);
            }}
            onKeyDown={(event: KeyboardEvent) => {
              monitorInputInteraction(event);
            }}
            autosize={true}
            minRows={1}
            radius="xs"
            placeholder="https://"
          />
          <div className="LexicalEditor__link__controls">
            <ToolbarActionIcon
              tooltip="Cancel"
              onClick={() => setIsLinkEditMode(false)}
            >
              <IconX size={12} />
            </ToolbarActionIcon>
            <ToolbarActionIcon
              tooltip="Save"
              onClick={() => handleLinkSubmission()}
            >
              <IconCheck size={12} />
            </ToolbarActionIcon>
          </div>
        </>
      ) : (
        <>
          <div className="LexicalEditor__link__preview">
            <a
              href={sanitizeUrl(linkUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {linkUrl}
            </a>
            {/* <IconArrowUpRight size={16} /> */}
          </div>
          <div className="LexicalEditor__link__controls">
            <ToolbarActionIcon
              tooltip="Edit"
              onClick={() => {
                setEditedLinkUrl(linkUrl);
                setIsLinkEditMode(true);
              }}
            >
              <IconPencil size={12} />
            </ToolbarActionIcon>
            <ToolbarActionIcon
              tooltip="Remove"
              onClick={() => {
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
              }}
            >
              <IconTrash size={12} />
            </ToolbarActionIcon>
          </div>
        </>
      )}
    </div>
  );
}

interface ToolbarActionIconProps {
  tooltip: string;
  onClick: () => void;
  children: ComponentChildren;
}

function ToolbarActionIcon(props: ToolbarActionIconProps) {
  return (
    <Tooltip label={props.tooltip} position="top" withArrow>
      <ActionIcon
        radius="xl"
        variant="default"
        color="dark"
        size="sm"
        title={props.tooltip}
        onClick={props.onClick}
      >
        {props.children}
      </ActionIcon>
    </Tooltip>
  );
}

function useFloatingLinkEditorToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isLinkEditMode: boolean,
  setIsLinkEditMode: Dispatch<boolean>
) {
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLink, setIsLink] = useState(false);

  useEffect(() => {
    function $updateToolbar() {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const focusNode = getSelectedNode(selection);
        const focusLinkNode = $findMatchingParent(focusNode, $isLinkNode);
        const focusAutoLinkNode = $findMatchingParent(
          focusNode,
          $isAutoLinkNode
        );
        if (!(focusLinkNode || focusAutoLinkNode)) {
          setIsLink(false);
          return;
        }
        const badNode = selection
          .getNodes()
          .filter((node) => !$isLineBreakNode(node))
          .find((node) => {
            const linkNode = $findMatchingParent(node, $isLinkNode);
            const autoLinkNode = $findMatchingParent(node, $isAutoLinkNode);
            return (
              (focusLinkNode && !focusLinkNode.is(linkNode)) ||
              (linkNode && !linkNode.is(focusLinkNode)) ||
              (focusAutoLinkNode && !focusAutoLinkNode.is(autoLinkNode)) ||
              (autoLinkNode &&
                (!autoLinkNode.is(focusAutoLinkNode) ||
                  autoLinkNode.getIsUnlinked()))
            );
          });
        if (!badNode) {
          setIsLink(true);
        } else {
          setIsLink(false);
        }
      } else if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes();
        if (nodes.length === 0) {
          setIsLink(false);
          return;
        }
        const node = nodes[0];
        const parent = node.getParent();
        if ($isLinkNode(parent) || $isLinkNode(node)) {
          setIsLink(true);
        } else {
          setIsLink(false);
        }
      }
    }
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, newEditor) => {
          $updateToolbar();
          setActiveEditor(newEditor);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CLICK_COMMAND,
        (payload) => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = getSelectedNode(selection);
            const linkNode = $findMatchingParent(node, $isLinkNode);
            // Prevent the browser from opening the link unless the meta key is
            // pressed.
            if (linkNode) {
              if (payload.metaKey || payload.ctrlKey) {
                window.open(linkNode.getURL(), '_blank');
                return true;
              }
              payload.preventDefault();
              payload.stopPropagation();
              return true;
            }
          }
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor]);

  return createPortal(
    <FloatingLinkEditor
      editor={activeEditor}
      isLink={isLink}
      anchorElem={anchorElem}
      setIsLink={setIsLink}
      isLinkEditMode={isLinkEditMode}
      setIsLinkEditMode={setIsLinkEditMode}
    />,
    anchorElem
  );
}

export interface FloatingLinkEditorPluginProps {
  anchorElem?: HTMLElement;
  isLinkEditMode: boolean;
  setIsLinkEditMode: Dispatch<boolean>;
}

export function FloatingLinkEditorPlugin(props: FloatingLinkEditorPluginProps) {
  const {anchorElem = document.body, isLinkEditMode, setIsLinkEditMode} = props;
  const [editor] = useLexicalComposerContext();
  return useFloatingLinkEditorToolbar(
    editor,
    anchorElem,
    isLinkEditMode,
    setIsLinkEditMode
  );
}

export function setFloatingElemPositionForLinkEditor(
  targetRect: DOMRect | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  verticalGap: number = VERTICAL_GAP,
  horizontalOffset: number = HORIZONTAL_OFFSET
): void {
  const scrollerElem = anchorElem.parentElement;

  if (targetRect === null || !scrollerElem) {
    floatingElem.style.opacity = '0';
    floatingElem.style.transform = 'translate(-10000px, -10000px)';
    return;
  }

  const floatingElemRect = floatingElem.getBoundingClientRect();
  const anchorElementRect = anchorElem.getBoundingClientRect();
  const editorScrollerRect = scrollerElem.getBoundingClientRect();

  let top = targetRect.top - verticalGap;
  let left = targetRect.left - horizontalOffset;

  if (top < editorScrollerRect.top) {
    top += floatingElemRect.height + targetRect.height + verticalGap * 2;
  }

  if (left + floatingElemRect.width > editorScrollerRect.right) {
    left = editorScrollerRect.right - floatingElemRect.width - horizontalOffset;
  }

  top -= anchorElementRect.top;
  left -= anchorElementRect.left;

  floatingElem.style.opacity = '1';
  floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}

function normalizeUrl(url: string) {
  if (!url) {
    return url;
  }
  return url.trim();
}
