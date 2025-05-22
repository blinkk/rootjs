import {useEffect, useRef, useState} from 'preact/hooks';
import {
  createEditor,
  ParagraphNode,
  RootNode,
  TextNode,
  LexicalEditor,
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  ElementNode, // Added ElementNode
  RangeSelection, // Added RangeSelection
} from 'lexical';
import {registerHistory} from '@lexical/history';
import {
  insertList,
  removeList,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  indentList,
  outdentList,
  INDENT_LIST_COMMAND,
  OUTDENT_LIST_COMMAND,
} from '@lexical/list';
import {mergeRegister} from '@lexical/utils';
import {CodeHighlightNode, getCodeLanguages, getDefaultCodeLanguage} from '@lexical/code';
import {LinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {isObject} from '../../utils/objects.js';
import './RichTextEditor.css'; // Import the CSS file
import {
  ImageNode,
  $createImageNode,
  INSERT_IMAGE_COMMAND,
  ImagePayload,
} from './ImageNode.js';
import {convertLexicalToEditorJS} from './lexicalToEditorJS.js';
import {convertEditorJSToLexical} from './editorJsToLexical.js'; // Import the new converter

export interface RichTextEditorProps {
  className?: string;
  placeholder?: string;
  value?: any;
  onChange?: (data: any) => void;
}

export type RichTextData = {
  [key: string]: any;
  blocks: any[];
  time?: number;
};

export function RichTextEditor(props: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  // currentValue was for EditorJS data. We might need a way to track if props.value (EditorJS) has been processed.
  // For now, let's remove `currentValue` and rely on `prevEditorState` in the update listener
  // or compare `props.value` directly if it's simple enough (e.g., by its `time` field).
  // const [currentValue, setCurrentValue] = useState<RichTextData | null>(null); 

  const placeholderText = props.placeholder || 'Start typing...';
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    const editorConfig = {
      namespace: 'RootCMSLexicalEditor',
      nodes: [
        RootNode,
        ParagraphNode,
        TextNode,
        HeadingNode,
        ListNode,
        ListItemNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        LinkNode,
        ImageNode, // Register ImageNode
      ],
      onError: (error: Error) => {
        console.error(error);
      },
      theme: {
        // TODO: Add basic styling for paragraph, etc.
        // Example:
        paragraph: 'lexical-paragraph',
        placeholder: 'lexical-placeholder', // Added placeholder class
        heading: {
          h2: 'lexical-h2',
          h3: 'lexical-h3',
          h4: 'lexical-h4',
          h5: 'lexical-h5',
        },
        list: {
          ul: 'lexical-ul',
          ol: 'lexical-ol',
        },
        listItem: 'lexical-li',
        quote: 'lexical-quote',
        code: 'lexical-code',
        link: 'lexical-link',
      },
    };

    const newEditor = createEditor(editorConfig);
    setEditor(newEditor);

    const unregisterHistory = registerHistory(newEditor);

    // Handle placeholder visibility based on editor content
    // const unregisterUpdateListener = newEditor.registerUpdateListener(({editorState}) => {
    //   const isEditorEmpty = editorState.read(() => {
    //     const root = newEditor.getRootElement();
    //     return root ? root.firstChild === null || (root.firstChild.textContent === '' && root.firstChild.nextSibling === null) : true;
    //   });
    //   setShowPlaceholder(isEditorEmpty);
    //   // TODO: Integrate props.onChange here by serializing editorState
    // });


    return () => {
      unregisterHistory();
      // unregisterUpdateListener(); // This will be handled by the merged unregister below
      // newEditor.destroy();
    };
  }, []); // Initial setup effect

  useEffect(() => {
    if (editor && editorRef.current) {
      editor.setRootElement(editorRef.current);

      // Handle initial props.value when editor is ready
      if (props.value && Object.keys(props.value).length > 0 && props.value.blocks && props.value.blocks.length > 0) {
        try {
          const lexicalEditorStateJSON = convertEditorJSToLexical(props.value as RichTextData);
          const lexicalEditorState = editor.parseEditorState(lexicalEditorStateJSON);
          editor.setEditorState(lexicalEditorState);
        } catch (e) {
          console.error("Error converting initial EditorJS data to Lexical:", e);
          // Initialize with empty state if conversion fails
          editor.update(() => {
            const root = $getRoot();
            const paragraph = $createParagraphNode();
            root.append(paragraph);
          });
        }
      } else {
        // Initialize with an empty paragraph if no initial value or empty blocks
         editor.update(() => {
            const root = $getRoot();
            if (root.isEmpty()) {
              const paragraph = $createParagraphNode();
              root.append(paragraph);
            }
          });
      }
    }
  }, [editor]); // Runs when editor is initialized

  // Effect to handle updates to props.value from parent
  // This needs to be distinct from the above, or carefully managed.
  // We need a way to compare if props.value has actually changed meaningfully.
  // Using props.value.time is a common pattern.
  const lastProcessedTimeRef = useRef<number | undefined>(undefined);

  // useEffect for handling props.value updates (this is the cleaned version)
  useEffect(() => {
    if (!editor) {
      return;
    }

    const valueToLoad = props.value as RichTextData;

    if (!valueToLoad) {
      // If props.value is null or undefined, and we had a previous value, clear the editor.
      // Otherwise, the initial empty state is handled by the first useEffect.
      if (lastProcessedTimeRef.current !== undefined) {
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          root.append(paragraph);
        });
        lastProcessedTimeRef.current = undefined;
      }
      return;
    }
    
    const newTime = valueToLoad.time;

    // Only update if `time` is different. This prevents re-parsing and setting state
    // if the parent re-renders but data is the same.
    if (newTime && newTime !== lastProcessedTimeRef.current) {
      if (valueToLoad.blocks && valueToLoad.blocks.length > 0) {
        try {
          const lexicalEditorStateJSON = convertEditorJSToLexical(valueToLoad);
          const lexicalEditorState = editor.parseEditorState(lexicalEditorStateJSON);
          editor.setEditorState(lexicalEditorState);
          lastProcessedTimeRef.current = newTime;
        } catch (e) {
          console.error("Error converting EditorJS data to Lexical:", e);
        }
      } else if (valueToLoad.blocks && valueToLoad.blocks.length === 0 && lastProcessedTimeRef.current !== undefined) {
        // If parent explicitly sends empty blocks after having content, clear the editor.
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          root.append(paragraph);
        });
        lastProcessedTimeRef.current = newTime;
      }
    }
  }, [editor, props.value]);


  // Toolbar button states (ensure these are defined only once)
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isLink, setIsLink] = useState(false); // Added for link state
  const [currentBlockType, setCurrentBlockType] = useState<string>('paragraph'); // For H2, H3 etc.

  useEffect(() => {
    if (!editor) return;

    const unregister = mergeRegister(
      // Moved the previous unregisterUpdateListener logic here and enhanced it
      editor.registerUpdateListener(({editorState, prevEditorState, tags}) => {
        // Update toolbar states
        editorState.read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
            setIsStrikethrough(selection.hasFormat('strikethrough'));
            
            const linkNodes = selection.getNodes().filter(node => node.getParent() instanceof LinkNode || node instanceof LinkNode);
            setIsLink(linkNodes.length > 0);

            const anchorNode = selection.anchor.getNode();
            let parent = anchorNode;
            while (parent != null && parent.getParent() != null && !(parent.getParent() instanceof RootNode) ) {
              parent = parent.getParent();
            }
            if (parent instanceof HeadingNode) setCurrentBlockType(parent.getTag());
            else if (parent instanceof QuoteNode) setCurrentBlockType('quote');
            else if (parent instanceof CodeNode) setCurrentBlockType('code');
            else if (parent instanceof ListItemNode) {
              const listParent = parent.getParent();
              if (listParent instanceof ListNode) setCurrentBlockType(listParent.getTag());
              else setCurrentBlockType('paragraph');
            } else setCurrentBlockType('paragraph');
          }
        });

        // Handle placeholder visibility
        const isEditorEmpty = editorState.read(() => {
            const root = editor.getRootElement();
            return root ? root.firstChild === null || (root.firstChild.textContent === '' && root.firstChild.nextSibling === null && root.getChildrenSize() === 1 && root.getFirstChild()?.getType() === 'paragraph' && (root.getFirstChild() as ParagraphNode).isEmpty()) : true;
        });
        setShowPlaceholder(isEditorEmpty);
        
        // Call props.onChange if it's provided and the state has changed
        // Ensure editor is not null before calling convertLexicalToEditorJS
        if (props.onChange && editor && !editorState.isEmpty() && editorState !== prevEditorState) {
            // Do not trigger onChange for selection changes that don't alter content
            // Or for changes that are just setting the initial/updated state from props.value
            const isInitializationOrPropsUpdate = tags.has('history-merge') || tags.has('collaboration') || (lastProcessedTimeRef.current === props.value?.time);

            if (!isInitializationOrPropsUpdate && (editorState.toJSON().root !== prevEditorState.toJSON().root) ) {
                 try {
                    const editorJSData = convertLexicalToEditorJS(editor);
                    if (editorJSData.blocks.length > 0 || prevEditorState.toJSON().root.children.length > 0) {
                         props.onChange({...editorJSData, time: Date.now()});
                    }
                 } catch (e) {
                    console.error("Error converting Lexical to EditorJS for onChange:", e);
                 }
            }
        }
      }),
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        (payload) => {
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.formatText(payload as any); // TODO: type safety
            }
          });
          return true; // Command was handled
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        FORMAT_ELEMENT_COMMAND,
        (payload) => {
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              // This is a generic handler. Specific logic for headings etc. will be in their click handlers.
              // Example: selection.formatElement(payload);
              // For now, let individual handlers manage block creation/transformation
            }
          });
          return true; // Command was handled
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        INSERT_ORDERED_LIST_COMMAND,
        () => {
          insertList(editor, 'ol');
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        INSERT_UNORDERED_LIST_COMMAND,
        () => {
          insertList(editor, 'ul');
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        REMOVE_LIST_COMMAND,
        () => {
          removeList(editor);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        INDENT_LIST_COMMAND,
        () => {
          indentList(editor);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        OUTDENT_LIST_COMMAND,
        () => {
          outdentList(editor);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        TOGGLE_LINK_COMMAND,
        (payload: string | null) => { // Payload can be URL string or null to remove link
          if (payload === null) { // Remove link
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                const nodes = selection.getNodes();
                nodes.forEach(node => {
                  const parent = node.getParent();
                  if (parent instanceof LinkNode) {
                    const children = parent.getChildren();
                    parent.replace(...children);
                  } else if (node instanceof LinkNode) {
                     const children = node.getChildren();
                     node.replace(...children);
                  }
                });
              }
            });
          } else { // Add/update link
             editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    const linkNode = new LinkNode(payload);
                    if (selection.isCollapsed()) {
                        // If no text selected, create a new text node with the URL as text
                        linkNode.append($createTextNode(payload));
                        selection.insertNodes([linkNode]);
                    } else {
                        // Wrap selected nodes
                        const nodes = selection.getNodes();
                        if (nodes.length === 1 && nodes[0] instanceof LinkNode) {
                             // If selecting just a link node, update its URL
                            (nodes[0] as LinkNode).setURL(payload);
                        } else {
                            selection.wrapNodes([linkNode]);
                        }
                    }
                }
            });
          }
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        INSERT_IMAGE_COMMAND,
        (payload: ImagePayload) => {
          editor.update(() => {
            const imageNode = $createImageNode(payload);
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              if (selection.isCollapsed()) {
                 selection.insertNodes([imageNode]);
              } else {
                selection.insertNodes([imageNode]); 
              }
            } else {
              // Fallback: insert at the end of the document
              const root = editor.getRootElement();
              if (root) {
                 const firstChild = root.getFirstChild();
                 if (firstChild) {
                    firstChild.append(imageNode);
                 } else {
                    const paragraph = $createParagraphNode();
                    paragraph.append(imageNode);
                    root.append(paragraph);
                 }
              }
            }
          });
          return true; 
        },
        COMMAND_PRIORITY_LOW
      )
      // TODO: Register commands for Quote, Code Block if implementing them
    );

    return () => {
      unregister();
    };
  }, [editor]);

  const formatText = (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    editor?.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatHeading = (level: 'h2' | 'h3' | 'h4' | 'h5') => {
    editor?.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const newHeading = new HeadingNode(level);
        const nodes = selection.getNodes();
        // A more robust way: iterate selected nodes and wrap/replace paragraphs or other headings.
        // This is a simplified approach. For more complex scenarios, consider $setBlocksType (if available and vanilla)
        // or more granular node manipulation.
        if (nodes.length > 0) {
            const firstNode = nodes[0];
            const parent = firstNode.getParentOrThrow();
            if (parent instanceof ParagraphNode || parent instanceof HeadingNode) {
                newHeading.append(...parent.getChildren());
                parent.replace(newHeading);
            } else { // Fallback: try to wrap the selection or insert a new heading
                const paragraph = $createParagraphNode();
                newHeading.append(paragraph); // Add an empty paragraph inside heading if needed
                selection.insertNodes([newHeading]);
            }
        } else { // If no nodes selected (e.g. caret at end of line)
             selection.insertNodes([newHeading]);
        }
      }
    });
  };

  const handleLink = () => {
    if (!editor) return;
    if (isLink) { // If already a link, remove it
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      const url = window.prompt('Enter URL:');
      if (url) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
      }
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      const file = files[0];
      try {
        const imageMeta = await uploadFileToGCS(file); // Using existing utility
        let imageUrl = imageMeta.src;
        // Optional: Adjust URL if needed (e.g., from isGciUrl logic if applicable)
        // if (isGciUrl(imageUrl)) { 
        //   imageUrl = `${imageUrl}=s0-e365`; 
        // }

        const altText = window.prompt('Enter alt text for the image:', imageMeta.name || 'image');
        
        if (editor) {
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            src: imageUrl,
            altText: altText || '', // Ensure altText is not null
            width: imageMeta.width, 
            height: imageMeta.height,
          });
        }
      } catch (err) {
        console.error('Error uploading image:', err);
        // TODO: Show user-friendly error message
      }
      // Reset file input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={joinClassNames(props.className, 'RichTextEditorContainer', 'lexical-editor-container')}>
      {editor && (
        <div className="toolbar">
          <button onClick={() => formatText('bold')} className={isBold ? 'active' : ''}>Bold</button>
          <button onClick={() => formatText('italic')} className={isItalic ? 'active' : ''}>Italic</button>
          <button onClick={() => formatText('underline')} className={isUnderline ? 'active' : ''}>Underline</button>
          <button onClick={() => formatText('strikethrough')} className={isStrikethrough ? 'active' : ''}>Strikethrough</button>
          <button disabled>Superscript</button>
          <button onClick={() => formatHeading('h2')} className={currentBlockType === 'h2' ? 'active' : ''}>H2</button>
          <button onClick={() => formatHeading('h3')} className={currentBlockType === 'h3' ? 'active' : ''}>H3</button>
          <button onClick={() => formatHeading('h4')} className={currentBlockType === 'h4' ? 'active' : ''}>H4</button>
          <button onClick={() => formatHeading('h5')} className={currentBlockType === 'h5' ? 'active' : ''}>H5</button>
          <button onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} className={currentBlockType === 'ul' ? 'active' : ''}>UL</button>
          <button onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} className={currentBlockType === 'ol' ? 'active' : ''}>OL</button>
          <button onClick={() => editor.dispatchCommand(INDENT_LIST_COMMAND, undefined)}>Indent</button>
          <button onClick={() => editor.dispatchCommand(OUTDENT_LIST_COMMAND, undefined)}>Outdent</button>
          <button onClick={handleLink} className={isLink ? 'active' : ''}>Link</button>
          <button onClick={handleImageUploadClick}>Image</button>
          <button disabled>Quote</button>
          <button disabled>Code Block</button>
        </div>
      )}
      {showPlaceholder && <div className="RichTextEditor-placeholder">{placeholderText}</div>}
      <div ref={editorRef} className="RichTextEditor-contentEditable" contentEditable={true} />
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelected} style={{display: 'none'}} />
    </div>
  );
}

// gcsUploader and isGciUrl are kept as they were.
// The new image upload directly uses `uploadFileToGCS`.
// `gcsUploader` function itself is not directly used in the new image upload flow,
// but its underlying `uploadFileToGCS` is.
export function validateRichTextData(data: RichTextData) {
  return isObject(data) && Array.isArray(data.blocks) && data.blocks.length > 0;
}

function gcsUploader() {
  // This function is part of the old EditorJS setup.
  // The new image upload logic uses uploadFileToGCS directly from handleFileSelected.
  // This function can be removed or refactored if it's no longer needed elsewhere.
  return {
    uploadByFile: async (file: File) => {
      console.warn(
        'gcsUploader().uploadByFile was called, but image uploads are now handled directly by RichTextEditor.tsx'
      );
      // Replicating old behavior for safety, but ideally this path isn't hit for new uploads.
      try {
        const imageMeta = await uploadFileToGCS(file);
        return {success: 1, file: {...imageMeta, url: imageMeta.src}};
      } catch (err) {
        console.error(err);
        return {success: 0, error: err};
      }
    },
    uploadByUrl: async (url: string) => {
      return {success: 0, error: 'upload by url not currently supported'};
    },
  };
}

function isGciUrl(url: string) {
  // This function might still be useful if GCS URLs need specific handling.
  return url.startsWith('https://lh3.googleusercontent.com/');
}
