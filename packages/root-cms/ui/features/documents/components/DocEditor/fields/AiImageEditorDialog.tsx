import {IconCheck, IconRobot} from '@tabler/icons-preact';
import {useMemo, useState} from 'preact/hooks';
import {Button} from '../../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../../primitives/Dialog/Dialog.js';
import {LoadingOverlay} from '../../../../../primitives/LoadingOverlay/LoadingOverlay.js';
import {Select} from '../../../../../primitives/Select/Select.js';
import {Textarea} from '../../../../../primitives/Textarea/Textarea.js';
import {showNotification} from '../../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../../utils/classes.js';
import {getAiImageEditingModels} from '../../../../ai/ai.js';

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
    <Dialog
      className="AiImageEditorDialog"
      open={props.opened}
      onClose={props.onClose}
      title="Edit with AI"
      size="xl"
      centered
      footer={
        <>
          <Button size="md" onClick={props.onClose} disabled={busy}>
            Discard
          </Button>
          <Button
            variant="blue"
            size="md"
            loading={saving}
            disabled={selectedIndex === 0 || generating}
            icon={<IconCheck />}
            onClick={handleSave}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="AiImageEditorDialog__Canvas relative flex h-100 w-full items-center justify-center bg-fg max-md:h-75">
          <LoadingOverlay visible={generating} />
          <img
            className="AiImageEditorDialog__Canvas__Image block max-h-full max-w-full object-contain"
            src={selectedVersion.src}
            alt={selectedVersion.prompt || 'Image being edited'}
          />
        </div>

        {versions.length > 1 && (
          <div className="AiImageEditorDialog__Versions flex gap-2 overflow-x-auto pb-1 *:flex-none">
            {versions.map((version, index) => (
              <Tooltip
                key={index}
                label={version.prompt || 'Original'}
                contentClassName="max-w-55"
              >
                <button
                  type="button"
                  className={cn(
                    'AiImageEditorDialog__Versions__Item relative m-0 size-16 flex-none cursor-pointer appearance-none rounded-sm border-2 border-solid border-transparent bg-fg p-0 disabled:cursor-default',
                    index === selectedIndex &&
                      'AiImageEditorDialog__Versions__Item--selected border-focus'
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
                  <img
                    className="block size-full object-contain"
                    src={version.src}
                    alt=""
                  />
                  <span className="AiImageEditorDialog__Versions__Item__Label absolute inset-x-0 bottom-0 truncate bg-strong/75 px-0.5 text-xs leading-snug text-inverse">
                    {index === 0 ? 'Original' : `v${index}`}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        )}

        <Textarea
          label="Describe the change"
          size="md"
          placeholder="e.g. remove the background, or make the sky purple"
          value={prompt}
          minRows={2}
          autosize
          maxRows={6}
          disabled={busy}
          data-autofocus
          onInput={(e) => setPrompt(e.currentTarget.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />

        <div className="flex flex-wrap items-end justify-between gap-4">
          {models.length > 1 ? (
            <Select
              className="AiImageEditorDialog__ModelSelect w-full max-w-60"
              label="Model"
              data={models.map((model) => ({
                value: model.id,
                label: model.label,
              }))}
              value={modelId}
              disabled={busy}
              onValueChange={(value) => setModelId(value || '')}
            />
          ) : (
            <div className="AiImageEditorDialog__status text-sm text-muted">
              {selectedIndex > 0
                ? `Editing v${selectedIndex}`
                : 'Editing the original'}
            </div>
          )}
          <Button
            variant="blue-light"
            size="md"
            loading={generating}
            disabled={saving || !prompt.trim()}
            icon={<IconRobot />}
            onClick={handleGenerate}
          >
            {generating ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </div>
    </Dialog>
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
