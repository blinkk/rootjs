import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {showNotification} from '@mantine/notifications';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
} from 'lexical';
import {useEffect} from 'preact/hooks';
import {uploadFileToGCS} from '../../../../utils/gcs.js';
import {
  $createBlockComponentNode,
  $isBlockComponentNode,
} from '../nodes/BlockComponentNode.js';

export function ImagePastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const {clipboardData} = event;
        if (!clipboardData) {
          return false;
        }

        const files = Array.from(clipboardData.files);
        const imageFile = files.find((file) => file.type.startsWith('image/'));

        if (imageFile) {
          event.preventDefault();
          uploadImage(imageFile);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  const uploadImage = async (file: File) => {
    const blobUrl = URL.createObjectURL(file);
    let nodeKey: string | null = null;

    // Insert the image immediately with the blob URL.
    editor.update(() => {
      const node = $createBlockComponentNode('image', {
        file: {
          src: blobUrl,
          width: 0,
          height: 0,
        },
        loading: true,
      });
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $insertNodes([node]);
        // Insert a paragraph after the image so the user can continue typing.
        const paragraph = $createParagraphNode();
        node.insertAfter(paragraph);
        paragraph.select();
      }
      nodeKey = node.getKey();
    });

    try {
      const uploadedAsset = await uploadFileToGCS(file);
      // Update the node with the actual GCS URL.
      editor.update(() => {
        if (nodeKey) {
          const node = $getNodeByKey(nodeKey);
          if ($isBlockComponentNode(node)) {
            node.setBlockData({
              file: uploadedAsset,
              loading: false,
            });
          }
        }
      });
    } catch (err) {
      console.error('Failed to upload image', err);
      showNotification({
        type: 'error',
        message: 'Failed to upload image',
      });
    }
  };

  return null;
}
