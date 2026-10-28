import {IconRobot} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {UploadedFile} from '../../../../../integrations/gcs.js';
import {Button} from '../../../../../primitives/Button/Button.js';
import {ColorInput} from '../../../../../primitives/ColorInput/ColorInput.js';
import {SegmentedControl} from '../../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Select} from '../../../../../primitives/Select/Select.js';
import {Textarea} from '../../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../../primitives/Toast/toastStore.js';
import {testAiImageGenerationEnabled} from '../../../../ai/ai.js';

interface GenerateImageFormProps {
  onSubmit: (file: UploadedFile) => void;
  initialWidth?: number;
  initialHeight?: number;
  swatches?: string[];
}

type Mode = 'simple' | 'ai';

/** Allowed aspect ratios for image generation (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GenerationConfig#ImageConfig). */
const ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
];

/** Default placeholder colors (from https://v4.mantine.dev/core/color-picker/#with-swatches). */
const PLACEHOLDER_COLORS = [
  '#25262b',
  '#868e96',
  '#fa5252',
  '#e64980',
  '#be4bdb',
  '#7950f2',
  '#4c6ef5',
  '#228be6',
  '#15aabf',
  '#12b886',
  '#40c057',
  '#82c91e',
  '#fab005',
  '#fd7e14',
];

export function GenerateImageForm(props: GenerateImageFormProps) {
  const [mode, setMode] = useState<Mode>('simple');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(props.initialWidth || 1600);
  const [height, setHeight] = useState(props.initialHeight || 900);
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');

  const aiEnabled = testAiImageGenerationEnabled();

  async function handleGenerate() {
    if (!prompt) {
      showNotification({
        title: 'Prompt required',
        message: 'Please enter a prompt to generate an image.',
        color: 'red',
      });
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/cms/api/ai.generate_image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          aspectRatio,
        }),
      });

      const data = await res.json();
      if (data.success && data.image) {
        setGeneratedImage(data.image);
      } else {
        throw new Error(data.error || 'Failed to generate image');
      }
    } catch (err: any) {
      console.error(err);
      showNotification({
        title: 'Generation failed',
        message: err.message || 'Unknown error',
        color: 'red',
      });
    } finally {
      setGenerating(false);
    }
  }

  function handleSimpleSubmit(e: Event) {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const w = parseInt(formData.get('width') as string, 10);
    const h = parseInt(formData.get('height') as string, 10);
    const backgroundColor = formData.get('backgroundColor') as string;
    const label = (formData.get('label') as string) || `${w}x${h}`;

    const svgParts: string[] = [];
    svgParts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${backgroundColor}" />`
    );
    if (label) {
      const maxTextWidthRatio = 0.5;
      const estimatedCharWidth = 0.6;
      const fontSize =
        (w * maxTextWidthRatio) / (label.length * estimatedCharWidth);
      svgParts.push(
        `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#fff">${label}</text>`
      );
    }
    svgParts.push('</svg>');
    const svg = svgParts.join('');

    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(svg);
    const src = `data:image/svg+xml;base64,${btoa(
      String.fromCharCode(...uint8Array)
    )}`;
    const placeholderFile: UploadedFile = {
      src: src,
      filename: 'placeholder.svg',
      width: w,
      height: h,
      alt: '',
    };
    props.onSubmit(placeholderFile);
  }

  async function handleAiSave() {
    if (!generatedImage) return;
    setSaving(true);
    try {
      // Fetch the image from the generated URL.
      const res = await fetch(generatedImage);
      const blob = await res.blob();
      const file = new File([blob], 'generated-image.png', {type: 'image/png'});

      // Upload to GCS.
      const {uploadFileToGCS} =
        await import('../../../../../integrations/gcs.js');
      const uploadedFile = await uploadFileToGCS(file);

      // Calculate dimensions based on aspect ratio.
      const [wRatio, hRatio] = aspectRatio.split(':').map(Number);
      // Assume a base width of 1600 for high quality.
      const calculatedWidth = 1600;
      const calculatedHeight = Math.round((calculatedWidth * hRatio) / wRatio);

      const placeholderFile: UploadedFile = {
        ...uploadedFile,
        width: calculatedWidth,
        height: calculatedHeight,
        alt: prompt,
      };
      props.onSubmit(placeholderFile);
    } catch (err: any) {
      console.error(err);
      showNotification({
        title: 'Save failed',
        message: err.message || 'Failed to upload image',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="GenerateImageForm flex flex-col gap-4">
      {aiEnabled && (
        <SegmentedControl
          className="GenerateImageForm__mode"
          aria-label="Placeholder type"
          value={mode}
          onValueChange={(val) => setMode(val)}
          data={[
            {label: 'Simple', value: 'simple'},
            {
              label: (
                <span className="flex items-center gap-1">
                  <IconRobot size={16} />
                  <span>Generate with AI</span>
                </span>
              ),
              value: 'ai',
            },
          ]}
          fullWidth
        />
      )}

      {mode === 'simple' ? (
        <form
          className="GenerateImageForm__simple"
          onSubmit={handleSimpleSubmit}
        >
          <div className="flex flex-col gap-4">
            <TextInput
              label="Width"
              name="width"
              type="number"
              size="md"
              value={width}
              onInput={(e) => setWidth(parseInt(e.currentTarget.value, 10))}
              data-autofocus
            />
            <TextInput
              label="Height"
              name="height"
              type="number"
              size="md"
              value={height}
              onInput={(e) => setHeight(parseInt(e.currentTarget.value, 10))}
            />
            <TextInput name="label" label="Label" size="md" defaultValue="" />
            <ColorInput
              name="backgroundColor"
              label="Background color"
              size="md"
              defaultValue="#868e96"
              swatches={PLACEHOLDER_COLORS}
            />
          </div>
          <div className="GenerateImageForm__actions mt-4 flex gap-4">
            <Button variant="blue" size="md" type="submit">
              Create
            </Button>
          </div>
        </form>
      ) : (
        <div className="GenerateImageForm__ai flex flex-col gap-4">
          <Select
            label="Aspect Ratio"
            size="md"
            data={ASPECT_RATIOS}
            value={aspectRatio}
            onValueChange={(val) => setAspectRatio(val as string)}
          />
          <Textarea
            label="Prompt"
            size="md"
            placeholder="Describe the image you want to generate..."
            minRows={3}
            value={prompt}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            data-autofocus
            required={true}
          />

          {generatedImage && (
            <img
              className="GenerateImageForm__preview block h-50 w-full object-contain"
              src={generatedImage}
              alt="Generated preview"
            />
          )}

          <div className="GenerateImageForm__actions mt-4 flex gap-4">
            <Button
              variant="blue-light"
              size="md"
              onClick={handleGenerate}
              loading={generating}
              disabled={saving || !prompt}
              icon={<IconRobot size={16} />}
            >
              {generating ? 'Generating...' : 'Preview'}
            </Button>
            <Button
              variant="blue"
              size="md"
              onClick={handleAiSave}
              loading={saving}
              disabled={!generatedImage || generating}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
