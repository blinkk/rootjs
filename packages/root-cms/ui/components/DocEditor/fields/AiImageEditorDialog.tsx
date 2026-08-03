import {
  Button,
  Group,
  LoadingOverlay,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconCheck, IconSparkles} from '@tabler/icons-preact';
import {useMemo, useState} from 'preact/hooks';
import {getAiImageEditingModels} from '../../../utils/ai.js';
import {joinClassNames} from '../../../utils/classes.js';
import './AiImageEditorDialog.css';

/** A single image in the edit history. */
interface ImageVersion {
  /** The image, as an absolute URL (the original) or a data URL (an edit). */
  src: string;
  /** The instruction that produced this version. Unset for the original. */
  prompt?: string;
}

/**
 * Props for the AiImageEditorDialog component.
 */
interface AiImageEditorDialogProps {
  /** Whether the dialog is opened. */
  opened: boolean;
  /** Callback when the dialog is closed. */
  onClose: () => void;
  /** The source URL of the image to edit. */
  src: string;
  /** The filename of the image, used to name the saved file. */
  filename?: string;
  /** Callback when an edited image is accepted. */
  onSave: (file: File) => void;
}

/**
 * Modal for editing an image with a natural language prompt.
 *
 * Each generation is appended to a version history, and the selected version
 * is used as the source for the next generation, so users can iterate on a
 * result (or step back to an earlier one and branch off it) before saving.
 */
export function AiImageEditorDialog(props: AiImageEditorDialogProps) {
  const theme = useMantineTheme();
  const models = useMemo(() => getAiImageEditingModels(), []);
  const [modelId, setModelId] = useState(models[0]?.id || '');
  const [versions, setVersions] = useState<ImageVersion[]>([{src: props.src}]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedVersion = versions[selectedIndex];
  const busy = generating || saving;

  async function handleGenerate() {
    const instruction = prompt.trim();
    if (!instruction || busy) {
      return;
    }
    setGenerating(true);
    try {
      const res = await window.fetch('/cms/api/ai.edit_image', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          imageUrl: selectedVersion.src,
          prompt: instruction,
          modelId: modelId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.image) {
        throw new Error(data.error || 'Failed to edit image');
      }
      setVersions([...versions, {src: data.image, prompt: instruction}]);
      setSelectedIndex(versions.length);
      setPrompt('');
    } catch (err: any) {
      console.error(err);
      showNotification({
        title: 'Edit failed',
        message: err.message || 'Unknown error',
        color: 'red',
        autoClose: false,
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (selectedIndex === 0 || busy) {
      return;
    }
    setSaving(true);
    try {
      const res = await window.fetch(selectedVersion.src);
      const blob = await res.blob();
      const filename = buildEditedFilename(props.filename, blob.type);
      props.onSave(new File([blob], filename, {type: blob.type}));
    } catch (err: any) {
      console.error(err);
      showNotification({
        title: 'Save failed',
        message: err.message || 'Failed to save the edited image',
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Edit with AI"
      size="xl"
      centered
      overlayColor={
        theme.colorScheme === 'dark'
          ? theme.colors.dark[9]
          : theme.colors.gray[2]
      }
    >
      <Stack spacing="md">
        <div className="AiImageEditorDialog__Canvas">
          <LoadingOverlay visible={generating} />
          <img
            className="AiImageEditorDialog__Canvas__Image"
            src={selectedVersion.src}
            alt={selectedVersion.prompt || 'Image being edited'}
          />
        </div>

        {versions.length > 1 && (
          <div className="AiImageEditorDialog__Versions">
            {versions.map((version, index) => (
              <Tooltip
                key={index}
                label={version.prompt || 'Original'}
                position="top"
                withArrow
                wrapLines
                width={220}
              >
                <button
                  type="button"
                  className={joinClassNames(
                    'AiImageEditorDialog__Versions__Item',
                    index === selectedIndex &&
                      'AiImageEditorDialog__Versions__Item--selected'
                  )}
                  disabled={busy}
                  onClick={() => setSelectedIndex(index)}
                  aria-label={
                    index === 0
                      ? 'Original'
                      : `Version ${index}: ${version.prompt}`
                  }
                  aria-pressed={index === selectedIndex}
                >
                  <img src={version.src} alt="" />
                  <span className="AiImageEditorDialog__Versions__Item__Label">
                    {index === 0 ? 'Original' : `v${index}`}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        )}

        <Textarea
          label="Describe the change"
          placeholder="e.g. remove the background, or make the sky purple"
          value={prompt}
          minRows={2}
          autosize
          maxRows={6}
          disabled={busy}
          data-autofocus
          onChange={(e: any) => setPrompt(e.currentTarget.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />

        <Group position="apart" align="flex-end">
          {models.length > 1 ? (
            <Select
              className="AiImageEditorDialog__ModelSelect"
              label="Model"
              size="xs"
              data={models.map((model) => ({
                value: model.id,
                label: model.label,
              }))}
              value={modelId}
              disabled={busy}
              onChange={(value: string | null) => setModelId(value || '')}
            />
          ) : (
            <Text size="xs" color="dimmed">
              {selectedIndex > 0
                ? `Editing v${selectedIndex}`
                : 'Editing the original'}
            </Text>
          )}
          <Button
            variant="light"
            loading={generating}
            disabled={saving || !prompt.trim()}
            leftIcon={<IconSparkles size={16} />}
            onClick={handleGenerate}
          >
            {generating ? 'Generating...' : 'Generate'}
          </Button>
        </Group>

        <Group position="right" mt="md">
          <Button variant="default" onClick={props.onClose} disabled={busy}>
            Discard
          </Button>
          <Button
            loading={saving}
            disabled={selectedIndex === 0 || generating}
            leftIcon={<IconCheck size={16} />}
            onClick={handleSave}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Names the edited file after the original, with the extension of the image
 * the model returned (e.g. `photo.jpg` -> `photo-edited.png`).
 */
function buildEditedFilename(filename?: string, mediaType?: string): string {
  const ext = (mediaType || '').split('/')[1]?.split(';')[0] || 'png';
  const dotIndex = filename ? filename.lastIndexOf('.') : -1;
  const basename = dotIndex > 0 ? filename!.slice(0, dotIndex) : filename;
  return `${basename || 'edited-image'}-edited.${ext}`;
}
