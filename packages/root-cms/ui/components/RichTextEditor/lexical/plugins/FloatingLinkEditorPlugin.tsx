import './FloatingLinkEditorPlugin.css';

import {$isAutoLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$findMatchingParent, mergeRegister} from '@lexical/utils';
import {ActionIcon, Checkbox, Textarea, Tooltip} from '@mantine/core';
import {IconCheck, IconTrash, IconX} from '@tabler/icons-preact';
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

const VERTICAL_GAP = 10;
const HORIZONTAL_OFFSET = 5;

interface FloatingLinkEditorProps {
  editor: LexicalEditor;
  isLink: boolean;
  setIsLink: Dispatch<boolean>;
  anchorElem: HTMLElement;
  isLinkEditMode: boolean;
  setIsLinkEditMode: Dispatch<boolean>;
  onDismiss?: () => void;
}

function FloatingLinkEditor(props: FloatingLinkEditorProps) {
  const {
    editor,
    isLink,
    setIsLink,
    anchorElem,
    isLinkEditMode,
    setIsLinkEditMode,
    onDismiss,
  } = props;
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [editedLinkUrl, setEditedLinkUrl] = useState('');
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [editedLinkTarget, setEditedLinkTarget] = useState<string | null>(null);
  const [lastSelection, setLastSelection] = useState<BaseSelection | null>(
    null
  );
  // Track the previous linkUrl to detect when we switch to a different link.
  const prevLinkUrlRef = useRef<string>('');

  const $updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const node = getSelectedNode(selection);
      const linkParent = $findMatchingParent(node, $isLinkNode);

      let url = '';
      let target: string | null = null;
      if (linkParent) {
        url = linkParent.getURL();
        target = linkParent.getTarget() || null;
      } else if ($isLinkNode(node)) {
        url = node.getURL();
        target = node.getTarget() || null;
      }
      setLinkUrl(url);
      setLinkTarget(target);
      // Always sync edited values when not actively editing (i.e., when the
      // input is not focused), or when switching to a different link.
      const isInputFocused = inputRef.current === document.activeElement;
      const isSwitchingLinks = url !== prevLinkUrlRef.current;
      if (!isInputFocused || isSwitchingLinks) {
        setEditedLinkUrl(normalizeUrl(url));
        setEditedLinkTarget(target);
      }
      prevLinkUrlRef.current = url;
    } else if ($isNodeSelection(selection)) {
      const nodes = selection.getNodes();
      if (nodes.length > 0) {
        const node = nodes[0];
        const parent = node.getParent();
        let url = '';
        let target: string | null = null;
        if ($isLinkNode(parent)) {
          url = parent.getURL();
          target = parent.getTarget() || null;
        } else if ($isLinkNode(node)) {
          url = node.getURL();
          target = node.getTarget() || null;
        }
        setLinkUrl(url);
        setLinkTarget(target);
        const isInputFocused = inputRef.current === document.activeElement;
        const isSwitchingLinks = url !== prevLinkUrlRef.current;
        if (!isInputFocused || isSwitchingLinks) {
          setEditedLinkUrl(normalizeUrl(url));
          setEditedLinkTarget(target);
        }
        prevLinkUrlRef.current = url;
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
      prevLinkUrlRef.current = '';
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
            onDismiss?.();
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
    if (isLink) {
      editor.getEditorState().read(() => {
        $updateLinkEditor();
      });
    }
  }, [isLink, editor, $updateLinkEditor]);

  useEffect(() => {
    if (isLinkEditMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLinkEditMode, isLink]);

  // Close the floating link editor when clicking outside of it or pressing
  // Escape. Clicks inside the editor popup or within the rich text editor
  // area are ignored so that the user can continue editing.
  useEffect(() => {
    if (!isLink) {
      return;
    }

    const closeLinkEditor = () => {
      setIsLink(false);
      setIsLinkEditMode(false);
      onDismiss?.();
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      // Ignore clicks inside the floating link editor popup.
      if (editorRef.current && editorRef.current.contains(target)) {
        return;
      }
      // Ignore clicks inside the rich text editor area.
      if (anchorElem.contains(target)) {
        return;
      }
      if (
        anchorElem.parentElement &&
        anchorElem.parentElement.contains(target)
      ) {
        return;
      }
      closeLinkEditor();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only close when focus is inside the floating link editor popup.
        if (
          editorRef.current &&
          editorRef.current.contains(document.activeElement)
        ) {
          event.preventDefault();
          closeLinkEditor();
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLink, anchorElem, setIsLink, setIsLinkEditMode]);

  const monitorInputInteraction = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLinkSubmission();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsLink(false);
      setIsLinkEditMode(false);
      onDismiss?.();
    }
  };

  const handleLinkSubmission = (e?: KeyboardEvent | MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (lastSelection !== null) {
      if (linkUrl !== null) {
        const targetValue = editedLinkTarget === '_blank' ? '_blank' : null;
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = getSelectedNode(selection);
            const linkNode = $findMatchingParent(node, $isLinkNode);
            if (linkNode) {
              // Update existing link node directly using setURL() and
              // setTarget() instead of TOGGLE_LINK_COMMAND. This ensures the
              // editor state is properly dirtied when only the target changes
              // (e.g. toggling "open in new tab"), which wouldn't trigger a
              // change if we used TOGGLE_LINK_COMMAND on an existing link.
              linkNode.setURL(normalizeUrl(editedLinkUrl));
              linkNode.setTarget(targetValue);
            } else if ($isLinkNode(node)) {
              node.setURL(normalizeUrl(editedLinkUrl));
              node.setTarget(targetValue);
            } else {
              // Create a new link if there isn't one.
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
                url: normalizeUrl(editedLinkUrl),
                target: targetValue,
              });
            }
          } else if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            if (nodes.length > 0) {
              const node = nodes[0];
              const parent = node.getParent();
              if ($isLinkNode(parent)) {
                parent.setURL(normalizeUrl(editedLinkUrl));
                parent.setTarget(targetValue);
              } else if ($isLinkNode(node)) {
                node.setURL(normalizeUrl(editedLinkUrl));
                node.setTarget(targetValue);
              }
            }
          }
        });
      }
      setIsLinkEditMode(false);
    }
  };

  // Check if user has made changes to the link.
  const hasChanges =
    normalizeUrl(editedLinkUrl) !== normalizeUrl(linkUrl) ||
    editedLinkTarget !== linkTarget;

  // Revert changes back to the original link values.
  const handleUndo = () => {
    setEditedLinkUrl(linkUrl);
    setEditedLinkTarget(linkTarget);
  };

  return (
    <div
      ref={editorRef}
      className={joinClassNames(
        'LexicalEditor__linkEditor',
        !isLink && 'LexicalEditor__linkEditor--hidden'
      )}
    >
      {!isLink || !lastSelection ? null : (
        <div className="LexicalEditor__link__editForm">
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
          <div className="LexicalEditor__link__row">
            <Checkbox
              className="LexicalEditor__link__target"
              label="Open in new tab"
              checked={editedLinkTarget === '_blank'}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setEditedLinkTarget(
                  event.currentTarget.checked ? '_blank' : null
                )
              }
              size="xs"
            />
            <div className="LexicalEditor__link__controls">
              {hasChanges && (
                <>
                  <ToolbarActionIcon tooltip="Undo" onClick={handleUndo}>
                    <IconX size={12} />
                  </ToolbarActionIcon>
                  <ToolbarActionIcon
                    tooltip="Save"
                    onClick={() => handleLinkSubmission()}
                  >
                    <IconCheck size={12} />
                  </ToolbarActionIcon>
                </>
              )}
              <ToolbarActionIcon
                tooltip="Remove"
                onClick={() => {
                  editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
                }}
              >
                <IconTrash size={12} />
              </ToolbarActionIcon>
            </div>
          </div>
        </div>
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

  // Tracks when the floating editor was last dismissed (e.g. via Escape).
  // Used to suppress re-opening the editor immediately after dismissal,
  // since the cursor is still on the link text and selection changes would
  // otherwise re-trigger the popup.
  const dismissedAtRef = useRef(0);
  const DISMISS_COOLDOWN_MS = 300;

  const onDismiss = useCallback(() => {
    dismissedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    function $updateToolbar() {
      // Suppress re-opening during the cooldown period after a dismissal.
      if (Date.now() - dismissedAtRef.current < DISMISS_COOLDOWN_MS) {
        return;
      }
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
      onDismiss={onDismiss}
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
