import {
  Button,
  ColorInput,
  Group,
  Image,
  Select,
  SegmentedControl,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconSparkles} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {UploadedFile} from '../../../utils/gcs.js';

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

  const experiments = (window as any).__ROOT_CTX?.experiments || {};

  const aiEnabled = !!experiments.ai;

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
      const {uploadFileToGCS} = await import('../../../utils/gcs.js');
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
    <Stack gap="md">
      {aiEnabled && (
        <SegmentedControl
          value={mode}
          onChange={(val) => setMode(val as Mode)}
          data={[
            {label: 'Simple', value: 'simple'},
            {
              label: (
                <Group gap={5}>
                  <IconSparkles size={16} />
                  <span>Generate with AI</span>
                </Group>
              ),
              value: 'ai',
            },
          ]}
          fullWidth
        />
      )}

      {mode === 'simple' ? (
        <form onSubmit={handleSimpleSubmit}>
          <Stack gap="xs">
            <TextInput
              label="Width"
              name="width"
              type="number"
              value={width}
              onChange={(e) => setWidth(parseInt(e.currentTarget.value, 10))}
              data-autofocus
            />
            <TextInput
              label="Height"
              name="height"
              type="number"
              value={height}
              onChange={(e) => setHeight(parseInt(e.currentTarget.value, 10))}
            />
            <TextInput name="label" label="Label" defaultValue="" />
            <ColorInput
              name="backgroundColor"
              label="Background color"
              format="hex"
              defaultValue="#868e96"
              swatches={PLACEHOLDER_COLORS}
            />
          </Stack>
          <Group justify="flex-end" mt="md">
            <Button variant="filled" type="submit">
              Create
            </Button>
          </Group>
        </form>
      ) : (
        <Stack gap="xs">
          <Select
            label="Aspect Ratio"
            data={ASPECT_RATIOS}
            value={aspectRatio}
            onChange={(val) => setAspectRatio(val as string)}
          />
          <Textarea
            label="Prompt"
            placeholder="Describe the image you want to generate..."
            minRows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            data-autofocus
            required={true}
          />

          {generatedImage && (
            <Image
              src={generatedImage}
              alt="Generated preview"
              height={200}
              fit="contain"
            />
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="light"
              onClick={handleGenerate}
              loading={generating}
              disabled={saving || !prompt}
              leftIcon={<IconSparkles size={16} />}
            >
              {generating ? 'Generating...' : 'Preview'}
            </Button>
            <Button
              variant="filled"
              onClick={handleAiSave}
              loading={saving}
              disabled={!generatedImage || generating}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
