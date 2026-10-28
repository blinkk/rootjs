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
  COMMON_ASPECT_RATIOS,
  formatAspectRatio,
  formatDimensionsAspectRatio,
  normalizeAspectRatios,
  parseAspectRatio,
  testAnyAspectRatioMatches,
  testAspectRatioMatches,
} from '../../../../../../shared/aspect-ratio.js';
import {GCI_URL_PREFIX} from '../../../../../integrations/gcs.js';
import {Button} from '../../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../../primitives/IconButton/IconButton.js';
import {NumberInput} from '../../../../../primitives/NumberInput/NumberInput.js';
import {Tooltip} from '../../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../../utils/classes.js';
import {
  CropBounds,
  CropHandle,
  CropRect,
  fitCrop,
  resizeCrop,
  roundCrop,
} from '../../../crop.js';
import './ImageEditorDialog.css';

/** Labels for preset aspect ratios that differ from the ratio itself. */
const PRESET_LABELS: Record<string, string> = {'1:1': 'Square'};

/** The minimum size of the crop box, in screen pixels. */
const MIN_CROP_DISPLAY_SIZE = 24;

/** The padding around the image inside the stage, in pixels. */
const STAGE_PADDING = 24;

/**
 * The fallback height of the stage, in pixels, until it's measured. The
 * stage is 460px tall, or 320px below `md`.
 */
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
  /**
   * When provided, a "Save as copy" button is shown alongside "Save" that
   * calls this callback with the cropped image instead of `onSave`.
   */
  onSaveAsCopy?: (file: File) => void;
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

  const handleSave = async (onSave: (file: File) => void) => {
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
        onSave(croppedImage);
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

  // Ratios shown on the chips, used to label the crop's aspect ratio (e.g.
  // `1400:600` rather than `7:3`).
  const knownRatios: AspectRatio[] = [
    ...(selectedOption.id === 'custom' && customWidth > 0 && customHeight > 0
      ? [`${customWidth}:${customHeight}`]
      : []),
    ...recommendedRatios,
    ...COMMON_ASPECT_RATIOS,
  ];

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

  const canRestore = Boolean(
    props.originalSrc && activeSrc !== props.originalSrc
  );

  return (
    <Dialog
      className="ImageEditorDialog"
      open={props.opened}
      onClose={props.onClose}
      title="Edit Image"
      size="xl"
      centered
      footer={
        <>
          {canRestore && (
            <Button
              className="ImageEditorDialog__restore mr-auto"
              size="md"
              onClick={handleRevert}
              disabled={saving}
            >
              Restore Original
            </Button>
          )}
          <Button onClick={props.onClose} disabled={saving}>
            Cancel
          </Button>
          {props.onSaveAsCopy && (
            <Button
              onClick={() => handleSave(props.onSaveAsCopy!)}
              disabled={saving || !outputCrop}
            >
              Save as copy
            </Button>
          )}
          <Button
            variant="blue"
            onClick={() => handleSave(props.onSave)}
            loading={saving}
            disabled={!outputCrop}
            icon={<IconCheck />}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="ImageEditorDialog__Toolbar flex items-center justify-between gap-2">
          <div
            className="ImageEditorDialog__AspectRatios flex flex-wrap gap-1.5"
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
                  className="ImageEditorDialog__AspectRatio rounded-full"
                  size="xs"
                  variant={selected ? 'blue' : 'default'}
                  role="radio"
                  aria-checked={selected}
                  icon={
                    option.recommended ? (
                      <IconStarFilled className="size-3!" />
                    ) : null
                  }
                  onClick={() => selectOption(option)}
                >
                  {label}
                </Button>
              );
              if (option.recommended) {
                return (
                  <Tooltip key={option.id} label="Recommended aspect ratio">
                    {button}
                  </Tooltip>
                );
              }
              return button;
            })}
          </div>
          {showOrientationToggle && (
            <IconButton
              className="ImageEditorDialog__orientation"
              variant="default"
              label={isPortrait ? 'Switch to landscape' : 'Switch to portrait'}
              onClick={toggleOrientation}
            >
              {isPortrait ? <IconRectangle /> : <IconRectangleVertical />}
            </IconButton>
          )}
        </div>

        {selectedOption.id === 'custom' && (
          <div className="ImageEditorDialog__Custom flex flex-wrap items-center gap-2">
            <NumberInput
              className="w-24"
              aria-label="Custom aspect ratio width"
              placeholder="Width"
              min={1}
              value={customWidth || undefined}
              onValueChange={(val) => setCustomWidth(val || 0)}
            />
            <span className="text-base text-muted">:</span>
            <NumberInput
              className="w-24"
              aria-label="Custom aspect ratio height"
              placeholder="Height"
              min={1}
              value={customHeight || undefined}
              onValueChange={(val) => setCustomHeight(val || 0)}
            />
            <span className="text-sm text-muted">
              Enter a ratio (e.g. 21:9) or exact dimensions (e.g. 1200:630).
            </span>
          </div>
        )}

        <div
          className="ImageEditorDialog__Stage relative flex h-115 w-full select-none items-center justify-center overflow-hidden bg-fg max-md:h-80"
          ref={setStageEl}
        >
          <div
            className="ImageEditorDialog__Canvas relative flex-none"
            style={canvasStyle}
          >
            <img
              key={cropperSrc}
              className="ImageEditorDialog__Image pointer-events-none block size-full"
              src={cropperSrc}
              crossOrigin="anonymous"
              alt=""
              draggable={false}
              onLoad={onImageLoad}
            />
            {crop && bounds && (
              <>
                <div className="ImageEditorDialog__Shade pointer-events-none absolute inset-0 overflow-hidden">
                  <div
                    className="ImageEditorDialog__Shade__Window absolute"
                    style={cropStyle}
                  />
                </div>
                <div
                  className={cn(
                    'ImageEditorDialog__Crop absolute cursor-move touch-none',
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
                  <div className="ImageEditorDialog__Crop__Grid pointer-events-none absolute inset-0" />
                  {CROP_HANDLES.map((handle) => (
                    <div
                      key={handle}
                      className={cn(
                        'ImageEditorDialog__Crop__Handle absolute touch-none',
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dl className="ImageEditorDialog__Details m-0 flex flex-col gap-0.5 text-sm">
            <div className="ImageEditorDialog__Details__Row flex gap-1.5">
              <dt className="min-w-22 text-muted">Image size:</dt>
              <dd className="m-0 flex items-center gap-2 tabular-nums">
                {outputCrop
                  ? `${outputCrop.width} × ${outputCrop.height} px`
                  : 'Loading…'}
              </dd>
            </div>
            <div className="ImageEditorDialog__Details__Row flex gap-1.5">
              <dt className="min-w-22 text-muted">Aspect ratio:</dt>
              <dd className="m-0 flex flex-wrap items-center gap-x-2 tabular-nums">
                {outputCrop
                  ? formatDimensionsAspectRatio(
                      outputCrop.width,
                      outputCrop.height,
                      knownRatios
                    )
                  : '–'}
                {mismatchesRecommended && (
                  <span className="ImageEditorDialog__Mismatch inline-flex items-center gap-1 text-sm text-warning">
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
          <div className="ImageEditorDialog__actions flex gap-2">
            <IconButton
              variant="default"
              size="md"
              label="Center horizontally"
              onClick={centerHorizontally}
            >
              <IconArrowsHorizontal />
            </IconButton>
            <IconButton
              variant="default"
              size="md"
              label="Center vertically"
              onClick={centerVertically}
            >
              <IconArrowsVertical />
            </IconButton>
            <IconButton
              variant="default"
              size="md"
              label="Reset crop"
              onClick={resetCrop}
            >
              <IconRefresh />
            </IconButton>
          </div>
        </div>
      </div>
    </Dialog>
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
  COMMON_ASPECT_RATIOS.forEach((preset) => {
    const value = parseAspectRatio(preset)!;
    const isRecommended = recommendedRatios.some((ratio) =>
      testAspectRatioMatches(value, 1, ratio, 0.001)
    );
    if (!isRecommended) {
      options.push({id: preset, label: PRESET_LABELS[preset] || preset, value});
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
