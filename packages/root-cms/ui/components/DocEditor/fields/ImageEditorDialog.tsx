import {
  ActionIcon,
  Button,
  ColorInput,
  Group,
  Modal,
  NumberInput,
  Slider,
  Stack,
  Text,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {
  IconArrowsHorizontal,
  IconArrowsVertical,
  IconCheck,
} from '@tabler/icons-preact';
import {useEffect, useState, useCallback, useMemo} from 'preact/hooks';
import EasyCrop from 'react-easy-crop';
import type {Area, MediaSize} from 'react-easy-crop';
import {GCI_URL_PREFIX} from '../../../utils/gcs.js';
import './ImageEditorDialog.css';

const Cropper = EasyCrop as any;

/**
 * Props for the ImageEditorDialog component.
 */
interface ImageEditorDialogProps {
  /** Check if the dialog is opened. */
  opened: boolean;
  /** Callback when the dialog is closed. */
  onClose: () => void;
  /** The source URL of the image to edit. */
  src: string;
  /** Callback when the image is saved. */
  onSave: (file: File) => void;
  /** The filename of the image. used to determine the file type. */
  filename?: string;
  /** The initial width of the crop frame. */
  initialWidth?: number;
  /** The initial height of the crop frame. */
  initialHeight?: number;
  /** The original source URL if the image has been edited. */
  originalSrc?: string;
}

export function ImageEditorDialog(props: ImageEditorDialogProps) {
  const theme = useMantineTheme();
  const [activeSrc, setActiveSrc] = useState(props.src);
  const [crop, setCrop] = useState({x: 0, y: 0});
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [frameWidth, setFrameWidth] = useState(props.initialWidth || 0);
  const [frameHeight, setFrameHeight] = useState(props.initialHeight || 0);

  const cropperSrc = useMemo(() => {
    // If the image is a Google Cloud Image, we can request the original image
    // by appending `=s0` to the URL. This ensures we are cropping the highest
    // quality image available.
    if (activeSrc.startsWith(GCI_URL_PREFIX)) {
      if (activeSrc.includes('=')) {
        return activeSrc.split('=')[0] + '=s0';
      }
      return activeSrc + '=s0';
    }
    return activeSrc;
  }, [activeSrc]);

  const ext = props.filename ? getFileExt(props.filename) : 'jpg';
  const fileType = ext === 'png' ? 'image/png' : 'image/jpeg';

  // JPGs need a background color.
  const isJpg =
    ext === 'jpg' ||
    ext === 'jpeg' ||
    props.src.toLowerCase().endsWith('.jpg') ||
    props.src.toLowerCase().endsWith('.jpeg');
  const [bgColor, setBgColor] = useState('#ffffff');

  useEffect(() => {
    setActiveSrc(props.src);
  }, [props.src]);

  useEffect(() => {
    if (props.initialWidth) {
      setFrameWidth(props.initialWidth);
    }
    if (props.initialHeight) {
      setFrameHeight(props.initialHeight);
    }
  }, [props.initialWidth, props.initialHeight]);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const onMediaLoaded = useCallback((mediaSize: MediaSize) => {
    setFrameWidth((prev) => (prev > 0 ? prev : mediaSize.naturalWidth));
    setFrameHeight((prev) => (prev > 0 ? prev : mediaSize.naturalHeight));
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) {
      return;
    }
    setSaving(true);
    try {
      const croppedImage = await getCroppedImg(
        cropperSrc,
        croppedAreaPixels,
        {width: frameWidth || 800, height: frameHeight || 600},
        props.filename,
        fileType,
        isJpg ? bgColor : undefined
      );
      if (croppedImage) {
        props.onSave(croppedImage);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const centerHorizontally = () => {
    setCrop((prev) => ({...prev, x: 0}));
  };

  const centerVertically = () => {
    setCrop((prev) => ({...prev, y: 0}));
  };

  const handleRevert = () => {
    if (props.originalSrc) {
      setActiveSrc(props.originalSrc);
      setFrameWidth(0);
      setFrameHeight(0);
      setCrop({x: 0, y: 0});
      setZoom(1);
    }
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Edit Image"
      size="xl"
      centered
      overlayColor={
        theme.colorScheme === 'dark'
          ? theme.colors.dark[9]
          : theme.colors.gray[2]
      }
    >
      <Stack spacing="md">
        <Group grow>
          <NumberInput
            label="Width"
            value={frameWidth || undefined}
            placeholder="Width"
            onChange={(val: number | '') =>
              setFrameWidth(typeof val === 'number' ? val : 0)
            }
          />
          <NumberInput
            label="Height"
            value={frameHeight || undefined}
            placeholder="Height"
            onChange={(val: number | '') =>
              setFrameHeight(typeof val === 'number' ? val : 0)
            }
          />
          {isJpg && (
            <ColorInput
              label="Background Color"
              value={bgColor}
              onChange={setBgColor}
            />
          )}
        </Group>

        <div className="ImageEditorDialog__CropperContainer">
          <Cropper
            image={cropperSrc}
            crop={crop}
            zoom={zoom}
            aspect={
              frameWidth && frameHeight ? frameWidth / frameHeight : undefined
            }
            minZoom={0.1}
            restrictPosition={false}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            onMediaLoaded={onMediaLoaded}
          />
        </div>

        <Group>
          <Text size="sm">Zoom</Text>
          <Slider
            className="ImageEditorDialog__ZoomSlider"
            value={(zoom - 1) * 100}
            min={-100}
            max={200}
            step={1}
            label={(val: number) => `${Math.round(val)}%`}
            onChange={(val: number) => setZoom(1 + val / 100)}
          />
          <Group spacing="xs">
            <Tooltip label="Center horizontally" withArrow>
              <ActionIcon
                variant="default"
                onClick={centerHorizontally}
                size="lg"
              >
                <IconArrowsHorizontal size={20} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Center vertically" withArrow>
              <ActionIcon
                variant="default"
                onClick={centerVertically}
                size="lg"
              >
                <IconArrowsVertical size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Group
          position={
            props.originalSrc && activeSrc !== props.originalSrc
              ? 'apart'
              : 'right'
          }
          mt="md"
        >
          {props.originalSrc && activeSrc !== props.originalSrc && (
            <Button variant="default" onClick={handleRevert} disabled={saving}>
              Restore Original
            </Button>
          )}
          <Group>
            <Button variant="default" onClick={props.onClose} disabled={saving}>
              Discard
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              leftIcon={<IconCheck />}
            >
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function getFileExt(filename: string) {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Creates a new File from the cropped area of an image.
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  frameSize: {width: number; height: number},
  filename: string = 'image.jpg',
  fileType: string = 'image/jpeg',
  bgColor?: string
): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  canvas.width = frameSize.width;
  canvas.height = frameSize.height;

  // Fill background if provided (for JPG support).
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    frameSize.width,
    frameSize.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const file = new File([blob], filename, {type: fileType});
      resolve(file);
    }, fileType);
  });
}

/** Creates an image from a URL. */
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous'); // Avoid CORS issues.
    image.src = url;
  });
}
