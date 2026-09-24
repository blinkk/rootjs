import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowsHorizontal,
  IconArrowsVertical,
  IconCheck,
  IconRectangle,
  IconRectangleVertical,
  IconRefresh,
  IconStarFilled,
} from '@tabler/icons-preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {
  AspectRatio,
  formatAspectRatio,
  formatDimensionsAspectRatio,
  normalizeAspectRatios,
  parseAspectRatio,
  testAnyAspectRatioMatches,
  testAspectRatioMatches,
} from '../../../../shared/aspect-ratio.js';
import {joinClassNames} from '../../../utils/classes.js';
import {
  CropBounds,
  CropHandle,
  CropRect,
  fitCrop,
  resizeCrop,
  roundCrop,
} from '../../../utils/crop.js';
import {GCI_URL_PREFIX} from '../../../utils/gcs.js';
import './ImageEditorDialog.css';

/** Preset aspect ratios available in the editor. */
const PRESET_ASPECT_RATIOS: Array<{label: string; value: string}> = [
  {label: 'Square', value: '1:1'},
  {label: '16:9', value: '16:9'},
  {label: '4:3', value: '4:3'},
  {label: '3:2', value: '3:2'},
  {label: '5:4', value: '5:4'},
];

/** The minimum size of the crop box, in screen pixels. */
const MIN_CROP_DISPLAY_SIZE = 24;

/** The padding around the image inside the stage, in pixels. */
const STAGE_PADDING = 24;

/** The default height of the stage, in pixels. */
const STAGE_HEIGHT = 460;

/** Handles rendered on the crop box. */
const CROP_HANDLES: CropHandle[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

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
  /** The original source URL if the image has been edited. */
  originalSrc?: string;
  /**
   * Recommended aspect ratios defined by the field's schema, e.g. `['16:9']`.
   * The first one is selected by default.
   */
  aspectRatios?: AspectRatio[];
}

/** An aspect ratio option selectable in the editor. */
interface AspectRatioOption {
  /** Unique ID for the option. */
  id: string;
  /** Label displayed on the option's button. */
  label: string;
  /** The aspect ratio (width / height), or `null` for a free crop. */
  value: number | null;
  /** Whether the option is recommended by the field's schema. */
  recommended?: boolean;
}

/** State tracked while dragging the crop box or one of its handles. */
interface DragState {
  handle: CropHandle;
  startX: number;
  startY: number;
  start: CropRect;
  /** Natural pixels per screen pixel. */
  scale: number;
}

/**
 * Dialog for cropping an image. The crop box can be moved and resized freely,
 * or locked to a preset, recommended or custom aspect ratio.
 */
export function ImageEditorDialog(props: ImageEditorDialogProps) {
  const theme = useMantineTheme();
  const [activeSrc, setActiveSrc] = useState(props.src);
  const [saving, setSaving] = useState(false);
  const [bounds, setBounds] = useState<CropBounds | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stageSize, setStageSize] = useState({width: 0, height: STAGE_HEIGHT});
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const recommendedRatios = useMemo(
    () => normalizeAspectRatios(props.aspectRatios),
    [props.aspectRatios]
  );

  const options = useMemo(
    () => buildAspectRatioOptions(recommendedRatios, bounds),
    [recommendedRatios, bounds]
  );

  const [selectedId, setSelectedId] = useState<string>(
    recommendedRatios.length > 0 ? 'recommended:0' : 'free'
  );
  const [flipped, setFlipped] = useState(false);
  const [customWidth, setCustomWidth] = useState<number>(16);
  const [customHeight, setCustomHeight] = useState<number>(9);

  const selectedOption =
    options.find((option) => option.id === selectedId) || options[0];

  const aspect = useMemo(() => {
    if (selectedOption.id === 'custom') {
      if (customWidth > 0 && customHeight > 0) {
        return customWidth / customHeight;
      }
      return null;
    }
    if (!selectedOption.value) {
      return null;
    }
    return flipped ? 1 / selectedOption.value : selectedOption.value;
  }, [selectedOption, flipped, customWidth, customHeight]);

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

  const fileType = getOutputFileType(props.filename || props.src);

  useEffect(() => {
    setActiveSrc(props.src);
  }, [props.src]);

  // Measure the stage so the image can be scaled to fit.
  useEffect(() => {
    if (!stageEl) {
      return;
    }
    // Use layout sizes rather than `getBoundingClientRect()`, which is
    // affected by the modal's open transition.
    const measure = () => {
      setStageSize({
        width: stageEl.clientWidth,
        height: stageEl.clientHeight || STAGE_HEIGHT,
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

  // Re-fit the crop box whenever the aspect ratio changes.
  useEffect(() => {
    if (!bounds) {
      return;
    }
    setCrop((prev) => {
      // Keep the current crop box when switching to a free crop, or when it
      // already matches the new aspect ratio.
      if (
        prev &&
        (!aspect || Math.abs(prev.width / prev.height / aspect - 1) < 0.001)
      ) {
        return prev;
      }
      const center = prev
        ? {x: prev.x + prev.width / 2, y: prev.y + prev.height / 2}
        : undefined;
      return fitCrop(bounds, aspect, center);
    });
  }, [aspect, bounds]);

  // The scale of the displayed image relative to its natural size.
  const displayScale = useMemo(() => {
    if (!bounds || !stageSize.width) {
      return 0;
    }
    const maxWidth = Math.max(stageSize.width - STAGE_PADDING * 2, 1);
    const maxHeight = Math.max(stageSize.height - STAGE_PADDING * 2, 1);
    return Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  }, [bounds, stageSize]);

  const outputCrop = crop && bounds ? roundCrop(crop, bounds, aspect) : null;

  const onImageLoad = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement;
    setCrop(null);
    setBounds({width: img.naturalWidth, height: img.naturalHeight});
  };

  const selectOption = (option: AspectRatioOption) => {
    if (option.id === 'custom' && selectedId !== 'custom' && outputCrop) {
      // Seed the custom ratio with the current crop size so users can type in
      // exact dimensions from there.
      setCustomWidth(outputCrop.width);
      setCustomHeight(outputCrop.height);
    }
    setSelectedId(option.id);
  };

  const toggleOrientation = () => {
    if (selectedOption.id === 'custom') {
      setCustomWidth(customHeight);
      setCustomHeight(customWidth);
      return;
    }
    setFlipped((prev) => !prev);
  };

  const onPointerDown = (e: PointerEvent, handle: CropHandle) => {
    if (!crop || !displayScale || e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      start: crop,
      scale: 1 / displayScale,
    };
    setDragging(true);
  };

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !bounds) {
        return;
      }
      setCrop(
        resizeCrop({
          start: drag.start,
          handle: drag.handle,
          dx: (e.clientX - drag.startX) * drag.scale,
          dy: (e.clientY - drag.startY) * drag.scale,
          bounds,
          aspect,
          minSize: MIN_CROP_DISPLAY_SIZE * drag.scale,
        })
      );
    },
    [bounds, aspect]
  );

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const onCropKeyDown = (e: KeyboardEvent) => {
    if (!crop || !bounds || !displayScale) {
      return;
    }
    const step = (e.shiftKey ? 10 : 1) / displayScale;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[e.key];
    if (!delta) {
      return;
    }
    e.preventDefault();
    setCrop(
      resizeCrop({
        start: crop,
        handle: 'move',
        dx: delta[0],
        dy: delta[1],
        bounds,
        aspect,
      })
    );
  };

  const centerHorizontally = () => {
    if (!crop || !bounds) {
      return;
    }
    setCrop({...crop, x: (bounds.width - crop.width) / 2});
  };

  const centerVertically = () => {
    if (!crop || !bounds) {
      return;
    }
    setCrop({...crop, y: (bounds.height - crop.height) / 2});
  };

  const resetCrop = () => {
    if (!bounds) {
      return;
    }
    setCrop(fitCrop(bounds, aspect));
  };

  const handleRevert = () => {
    if (props.originalSrc) {
      setActiveSrc(props.originalSrc);
      setBounds(null);
      setCrop(null);
    }
  };

  const handleSave = async () => {
    if (!outputCrop) {
      return;
    }
    setSaving(true);
    try {
      const croppedImage = await getCroppedImg(
        cropperSrc,
        outputCrop,
        props.filename,
        fileType
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

  const showOrientationToggle =
    selectedOption.id === 'custom' ||
    (selectedOption.value !== null && selectedOption.value !== 1);
  const isPortrait = aspect !== null && aspect < 1;

  const mismatchesRecommended =
    recommendedRatios.length > 0 &&
    outputCrop !== null &&
    !testAnyAspectRatioMatches(
      outputCrop.width,
      outputCrop.height,
      recommendedRatios
    );

  // The canvas is hidden until the image loads and its size is known.
  const canvasStyle = {
    width: `${bounds ? bounds.width * displayScale : 0}px`,
    height: `${bounds ? bounds.height * displayScale : 0}px`,
  };
  const cropStyle =
    crop && bounds
      ? {
          left: `${(crop.x / bounds.width) * 100}%`,
          top: `${(crop.y / bounds.height) * 100}%`,
          width: `${(crop.width / bounds.width) * 100}%`,
          height: `${(crop.height / bounds.height) * 100}%`,
        }
      : undefined;

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
        <div className="ImageEditorDialog__Toolbar">
          <div
            className="ImageEditorDialog__AspectRatios"
            role="radiogroup"
            aria-label="Aspect ratio"
          >
            {options.map((option) => {
              const selected = option.id === selectedOption.id;
              const label =
                selected && flipped && option.value && option.id !== 'custom'
                  ? flipAspectRatioLabel(option.label)
                  : option.label;
              const button = (
                <Button
                  key={option.id}
                  size="xs"
                  compact
                  radius="xl"
                  variant={selected ? 'filled' : 'default'}
                  role="radio"
                  aria-checked={selected}
                  leftIcon={
                    option.recommended ? <IconStarFilled size={12} /> : null
                  }
                  onClick={() => selectOption(option)}
                >
                  {label}
                </Button>
              );
              if (option.recommended) {
                return (
                  <Tooltip
                    key={option.id}
                    label="Recommended aspect ratio"
                    withArrow
                  >
                    {button}
                  </Tooltip>
                );
              }
              return button;
            })}
          </div>
          {showOrientationToggle && (
            <Tooltip
              label={isPortrait ? 'Switch to landscape' : 'Switch to portrait'}
              withArrow
            >
              <ActionIcon
                variant="default"
                size="md"
                onClick={toggleOrientation}
                aria-label={
                  isPortrait ? 'Switch to landscape' : 'Switch to portrait'
                }
              >
                {isPortrait ? (
                  <IconRectangle size={18} />
                ) : (
                  <IconRectangleVertical size={18} />
                )}
              </ActionIcon>
            </Tooltip>
          )}
        </div>

        {selectedOption.id === 'custom' && (
          <Group spacing="xs" className="ImageEditorDialog__Custom">
            <NumberInput
              size="xs"
              aria-label="Custom aspect ratio width"
              placeholder="Width"
              min={1}
              value={customWidth || undefined}
              onChange={(val: number | undefined) => setCustomWidth(val || 0)}
            />
            <Text size="sm" color="dimmed">
              :
            </Text>
            <NumberInput
              size="xs"
              aria-label="Custom aspect ratio height"
              placeholder="Height"
              min={1}
              value={customHeight || undefined}
              onChange={(val: number | undefined) => setCustomHeight(val || 0)}
            />
            <Text size="xs" color="dimmed">
              Enter a ratio (e.g. 21:9) or exact dimensions (e.g. 1200:630).
            </Text>
          </Group>
        )}

        <div
          className="ImageEditorDialog__Stage"
          ref={setStageEl}
          style={{height: `${STAGE_HEIGHT}px`}}
        >
          <div className="ImageEditorDialog__Canvas" style={canvasStyle}>
            <img
              key={cropperSrc}
              className="ImageEditorDialog__Image"
              src={cropperSrc}
              crossOrigin="anonymous"
              alt=""
              draggable={false}
              onLoad={onImageLoad}
            />
            {crop && bounds && (
              <>
                <div className="ImageEditorDialog__Shade">
                  <div
                    className="ImageEditorDialog__Shade__Window"
                    style={cropStyle}
                  />
                </div>
                <div
                  className={joinClassNames(
                    'ImageEditorDialog__Crop',
                    dragging && 'ImageEditorDialog__Crop--dragging'
                  )}
                  style={cropStyle}
                  tabIndex={0}
                  role="group"
                  aria-label="Crop area. Use the arrow keys to move it."
                  onPointerDown={(e) => onPointerDown(e, 'move')}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onKeyDown={onCropKeyDown}
                >
                  <div className="ImageEditorDialog__Crop__Grid" />
                  {CROP_HANDLES.map((handle) => (
                    <div
                      key={handle}
                      className={joinClassNames(
                        'ImageEditorDialog__Crop__Handle',
                        `ImageEditorDialog__Crop__Handle--${handle}`
                      )}
                      data-handle={handle}
                      onPointerDown={(e) => onPointerDown(e, handle)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <Group position="apart" spacing="xs">
          <dl className="ImageEditorDialog__Details">
            <div className="ImageEditorDialog__Details__Row">
              <dt>Image size:</dt>
              <dd>
                {outputCrop
                  ? `${outputCrop.width} × ${outputCrop.height} px`
                  : 'Loading…'}
              </dd>
            </div>
            <div className="ImageEditorDialog__Details__Row">
              <dt>Aspect ratio:</dt>
              <dd>
                {outputCrop
                  ? formatDimensionsAspectRatio(
                      outputCrop.width,
                      outputCrop.height
                    )
                  : '–'}
                {mismatchesRecommended && (
                  <span className="ImageEditorDialog__Mismatch">
                    <IconAlertTriangle size={14} />
                    Recommended:{' '}
                    {recommendedRatios
                      .map((r) => formatAspectRatio(r))
                      .join(', ')}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <Group spacing="xs">
            <Tooltip label="Center horizontally" withArrow>
              <ActionIcon
                variant="default"
                onClick={centerHorizontally}
                size="lg"
                aria-label="Center horizontally"
              >
                <IconArrowsHorizontal size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Center vertically" withArrow>
              <ActionIcon
                variant="default"
                onClick={centerVertically}
                size="lg"
                aria-label="Center vertically"
              >
                <IconArrowsVertical size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Reset crop" withArrow>
              <ActionIcon
                variant="default"
                onClick={resetCrop}
                size="lg"
                aria-label="Reset crop"
              >
                <IconRefresh size={18} />
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
          <Group spacing="xs">
            <Button
              variant="default"
              size="xs"
              onClick={props.onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={handleSave}
              loading={saving}
              disabled={!outputCrop}
              leftIcon={<IconCheck size={20} />}
            >
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Builds the list of aspect ratio options. Recommended ratios are listed
 * first, and presets that duplicate a recommended ratio are omitted.
 */
function buildAspectRatioOptions(
  recommendedRatios: AspectRatio[],
  bounds: CropBounds | null
): AspectRatioOption[] {
  const options: AspectRatioOption[] = [];
  recommendedRatios.forEach((ratio, i) => {
    options.push({
      id: `recommended:${i}`,
      label: formatAspectRatio(ratio),
      value: parseAspectRatio(ratio),
      recommended: true,
    });
  });
  options.push({id: 'free', label: 'Free', value: null});
  if (bounds) {
    options.push({
      id: 'original',
      label: 'Original',
      value: bounds.width / bounds.height,
    });
  }
  PRESET_ASPECT_RATIOS.forEach((preset) => {
    const value = parseAspectRatio(preset.value)!;
    const isRecommended = recommendedRatios.some((ratio) =>
      testAspectRatioMatches(value, 1, ratio, 0.001)
    );
    if (!isRecommended) {
      options.push({id: preset.value, label: preset.label, value});
    }
  });
  options.push({id: 'custom', label: 'Custom', value: null});
  return options;
}

/** Flips an aspect ratio label, e.g. `16:9` becomes `9:16`. */
function flipAspectRatioLabel(label: string) {
  const parts = label.split(':');
  if (parts.length === 2) {
    return `${parts[1]}:${parts[0]}`;
  }
  return label;
}

/** Returns the mimetype to use for the cropped image. */
function getOutputFileType(filename: string) {
  const ext = filename.split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') {
    return 'image/png';
  }
  if (ext === 'webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

/**
 * Creates a new File from the cropped area of an image, at the image's native
 * resolution.
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CropRect,
  filename: string = 'image.jpg',
  fileType: string = 'image/jpeg'
): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // JPGs don't support transparency, so fill the background with white.
  if (fileType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
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
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], filename, {type: fileType});
        resolve(file);
      },
      fileType,
      0.92
    );
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
