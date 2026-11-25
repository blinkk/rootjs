import {
  IconFileText,
  IconPaperclip,
  IconRobot,
  IconX,
} from '@tabler/icons-preact';
import type {JSX} from 'preact';
import {useEffect, useId, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import type {PrototypeBoardBundle} from '../../../../../shared/prototypes.js';
import {uploadFileToGCS} from '../../../../integrations/gcs.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {Field} from '../../../../primitives/Field/Field.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../utils/classes.js';
import {showErrorNotification} from '../../../../utils/notifications.js';
import {useDocPickerModal} from '../../../collections/components/DocPickerModal/useDocPickerModal.js';
import {
  apiCreatePrototypeBoard,
  type PrototypePromptAttachment,
  storeInitialPrototypePrompt,
} from '../../prototypes-client.js';

const SELECTED_MODEL_STORAGE_KEY = 'root-cms.ai.selectedModel';

interface ModalModelOption {
  id: string;
  label: string;
  capabilities?: {
    attachments?: boolean;
  };
}

function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}

function getInitialCtxModels(): {
  models: ModalModelOption[];
  defaultModel?: string;
} {
  if (typeof window === 'undefined') {
    return {models: []};
  }
  const ctxAi = window.__ROOT_CTX?.ai;
  if (ctxAi && Array.isArray(ctxAi.models) && ctxAi.models.length > 0) {
    return {
      models: ctxAi.models.map((m) => ({
        id: m.id,
        label: m.label,
        capabilities: m.capabilities,
      })),
      defaultModel: ctxAi.defaultModel,
    };
  }
  return {models: []};
}

function resolvePreferredModelId(
  models: ModalModelOption[],
  defaultModel?: string
): string {
  if (models.length === 0) {
    return '';
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
      if (stored && models.some((m) => m.id === stored)) {
        return stored;
      }
    } catch {
      // Ignore localStorage read errors.
    }
  }
  if (defaultModel && models.some((m) => m.id === defaultModel)) {
    return defaultModel;
  }
  return models[0].id;
}

/**
 * Builds the initial Root AI prompt queued when creating a board, grounding
 * generation on `seedDocId` when an existing CMS page was selected.
 */
export function buildSeededPrototypePrompt(
  seedDocId: string,
  userPrompt: string
): string {
  const docId = seedDocId.trim();
  const trimmed = userPrompt.trim();
  if (!docId) {
    return trimmed;
  }
  if (!trimmed) {
    return `/explore-variants Start from existing CMS document \`${docId}\` (read its live draft content via \`doc_get\` and inspect its site components via \`component_inspect\`), then generate 2–3 distinct layout explorations grounded in its real copy and structure.`;
  }
  if (trimmed.includes(docId)) {
    return trimmed;
  }
  const skillMatch = trimmed.match(/^(\/[a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (skillMatch) {
    const [, skill, rest] = skillMatch;
    return `${skill} Starting from existing CMS document \`${docId}\` (read its live draft content via \`doc_get\` and inspect its components via \`component_inspect\`): ${rest || 'explore layout variants.'}`;
  }
  return `Starting from existing CMS document \`${docId}\` (read its live draft content via \`doc_get\` and inspect its components via \`component_inspect\`): ${trimmed}`;
}

/** Props for `NewPrototypeModal`. */
export interface NewPrototypeModalProps {
  /** Whether the modal dialog is open. */
  open: boolean;
  /** Called when the modal should close. */
  onClose: () => void;
  /** Called after a new board is created, before navigation completes. */
  onCreated?: (bundle: PrototypeBoardBundle) => void;
}

/**
 * Modal dialog for creating a new UX prototype board, with optional seeding
 * from an existing CMS document, AI model selection, and an initial Root AI
 * prompt that auto-queues when the board opens.
 */
export function NewPrototypeModal(props: NewPrototypeModalProps) {
  const {route} = useLocation();
  const docPickerModal = useDocPickerModal();
  const formId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [seedDocId, setSeedDocId] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [attachments, setAttachments] = useState<PrototypePromptAttachment[]>(
    []
  );
  const [uploadingCount, setUploadingCount] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModalModelOption[]>(
    () => getInitialCtxModels().models
  );
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const initial = getInitialCtxModels();
    return resolvePreferredModelId(initial.models, initial.defaultModel);
  });
  const [titleError, setTitleError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const availableCollections = useMemo(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    return Object.keys(window.__ROOT_CTX?.collections || {});
  }, [props.open]);

  const selectedModel =
    models.find((m) => m.id === selectedModelId) || models[0];
  const canAttach = selectedModel?.capabilities?.attachments ?? true;
  const uploading = uploadingCount > 0;

  // Reset form fields and sync available AI models each time the dialog opens.
  useEffect(() => {
    if (!props.open) {
      return;
    }
    setTitle('');
    setDescription('');
    setSeedDocId('');
    setInitialPrompt('');
    setAttachments([]);
    setUploadingCount(0);
    setDraggingFiles(false);
    setTitleError('');
    setSubmitting(false);

    const ctxModels = getInitialCtxModels();
    if (ctxModels.models.length > 0) {
      setModels(ctxModels.models);
      setSelectedModelId(
        resolvePreferredModelId(ctxModels.models, ctxModels.defaultModel)
      );
    }

    let active = true;
    fetch('/cms/api/ai.config', {credentials: 'include'})
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          enabled?: boolean;
          defaultModel?: string;
          models?: ModalModelOption[];
        };
        if (!active || !data.enabled || !Array.isArray(data.models)) {
          return;
        }
        const fetched = data.models;
        setModels(fetched);
        setSelectedModelId((current) => {
          if (current && fetched.some((m) => m.id === current)) {
            return current;
          }
          return resolvePreferredModelId(fetched, data.defaultModel);
        });
      })
      .catch(() => {
        // Leave context models in place if fetching `ai.config` fails.
      });

    return () => {
      active = false;
    };
  }, [props.open]);

  async function uploadFiles(files: File[]) {
    if (!canAttach || files.length === 0) {
      return;
    }
    setUploadingCount((count) => count + files.length);
    try {
      await Promise.all(
        files.map(async (file) => {
          try {
            const mediaType = file.type || guessMimeType(file.name);
            const data: any = await uploadFileToGCS(file, {disableGci: true});
            setAttachments((prev) => [
              ...prev,
              {
                url: data.src,
                filename: data.filename || file.name,
                mediaType,
              },
            ]);
          } catch (err) {
            showErrorNotification(err, {title: 'Attachment upload failed'});
          } finally {
            setUploadingCount((count) => Math.max(0, count - 1));
          }
        })
      );
    } finally {
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  }

  function handleFileChange(e: JSX.TargetedEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files || []);
    void uploadFiles(files);
  }

  function handleClose() {
    if (submitting) {
      return;
    }
    props.onClose();
  }

  function openSeedDocPicker() {
    docPickerModal.open({
      enableSearch: true,
      enableSort: true,
      enableStatusBadges: true,
      enableCreate: false,
      initialCollection: availableCollections.includes('Pages')
        ? 'Pages'
        : undefined,
      selectedDocIds: seedDocId ? [seedDocId] : undefined,
      onChange: (docId: string) => {
        setSeedDocId(docId);
        setTitle((prev) => {
          if (prev.trim()) {
            return prev;
          }
          const rawSlug = docId.split('/').slice(1).join('/') || docId;
          const humanized = rawSlug.replace(/[-_/]+/g, ' ').trim();
          return humanized
            ? humanized.charAt(0).toUpperCase() + humanized.slice(1)
            : prev;
        });
        setTitleError('');
        docPickerModal.close();
      },
    });
  }

  async function handleSubmit(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || uploading) {
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError('Please enter a title for this prototype.');
      return;
    }

    const trimmedDescription = description.trim();
    const trimmedSeedDocId = seedDocId.trim();
    const effectivePrompt =
      models.length > 0
        ? buildSeededPrototypePrompt(trimmedSeedDocId, initialPrompt)
        : initialPrompt.trim();

    if (selectedModelId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          SELECTED_MODEL_STORAGE_KEY,
          selectedModelId
        );
      } catch {
        // Ignore localStorage write errors.
      }
    }

    setTitleError('');
    setSubmitting(true);
    try {
      const created = await apiCreatePrototypeBoard({
        title: trimmedTitle,
        description: trimmedDescription || undefined,
        seedDocId: trimmedSeedDocId || undefined,
        initialPrompt: effectivePrompt || undefined,
      });
      props.onCreated?.(created);
      props.onClose();
      if (effectivePrompt || attachments.length > 0) {
        if (attachments.length > 0) {
          storeInitialPrototypePrompt(
            created.board.id,
            effectivePrompt,
            attachments
          );
        } else {
          storeInitialPrototypePrompt(created.board.id, effectivePrompt);
        }
      }
      route(`/cms/prototypes/${created.board.id}`);
    } catch (err) {
      showErrorNotification(err, {
        title: 'Failed to create prototype',
        dedupe: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={handleClose}
      title="New prototype"
      description="Create an isolated artboard to explore page layouts and iterate with Root AI."
      size="md"
      closeOnEscape={!submitting}
      closeOnClickOutside={!submitting}
      className="NewPrototypeModal"
      footer={
        <>
          <Button
            variant="default"
            size="md"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            size="md"
            loading={submitting}
            disabled={uploading}
          >
            Create prototype
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="NewPrototypeModal__form flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
      >
        <TextInput
          className="NewPrototypeModal__titleInput"
          label="Title"
          placeholder="e.g., Pricing page refresh"
          size="md"
          required
          data-autofocus
          disabled={submitting}
          value={title}
          error={titleError || undefined}
          onInput={(e) => {
            setTitle(e.currentTarget.value);
            if (titleError) {
              setTitleError('');
            }
          }}
        />
        <Textarea
          className="NewPrototypeModal__descriptionInput"
          label="Description"
          description="Optional summary shown on the prototypes list."
          placeholder="Compare two pricing page layouts and gather team feedback."
          size="md"
          autosize
          minRows={2}
          maxRows={4}
          disabled={submitting}
          value={description}
          onInput={(e) => setDescription(e.currentTarget.value)}
        />
        {availableCollections.length > 0 && (
          <div className="NewPrototypeModal__seedField flex flex-col gap-1.5">
            <div className="text-sm font-medium text-strong">
              Start from existing page
            </div>
            <div className="text-xs text-muted">
              Optional. Grounds Root AI on an existing CMS document&apos;s live
              draft copy and components.
            </div>
            {seedDocId ? (
              <div className="NewPrototypeModal__seedSelected flex items-center justify-between gap-2 rounded-md border border-border bg-page px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <IconFileText
                    size={16}
                    className="shrink-0 text-muted"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate font-mono text-sm text-strong">
                    {seedDocId}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    disabled={submitting}
                    onClick={openSeedDocPicker}
                  >
                    Change
                  </Button>
                  <IconButton
                    size="xs"
                    variant="subtle"
                    label="Clear seed page"
                    disabled={submitting}
                    onClick={() => setSeedDocId('')}
                  >
                    <IconX />
                  </IconButton>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="default"
                size="md"
                className="NewPrototypeModal__seedPickerButton self-start"
                icon={<IconFileText />}
                disabled={submitting}
                onClick={openSeedDocPicker}
              >
                Choose CMS document…
              </Button>
            )}
          </div>
        )}
        {models.length > 0 && (
          <Select
            className="NewPrototypeModal__modelSelect"
            label="AI model"
            size="md"
            disabled={submitting}
            data={models.map((m) => ({value: m.id, label: m.label}))}
            value={selectedModelId}
            onValueChange={(value) => {
              if (value) {
                setSelectedModelId(value);
              }
            }}
          />
        )}
        <Field
          className="NewPrototypeModal__promptInput"
          size="md"
          label={
            <span className="NewPrototypeModal__promptLabel inline-flex items-center gap-1.5">
              <span>Initial AI prompt</span>
              <Badge
                tone="neutral"
                variant="outline"
                size="xs"
                icon={<IconRobot />}
              >
                Root AI
              </Badge>
            </span>
          }
          description={
            seedDocId
              ? 'Optional. Leave blank to explore layout variants directly from the selected CMS page.'
              : 'Optional. Queues automatically in Root AI as soon as the board opens.'
          }
        >
          {(control) => (
            <div
              className={cn(
                'NewPrototypeModal__promptBox rounded-sm border bg-surface transition-colors focus-within:border-focus',
                draggingFiles
                  ? 'border-focus bg-info-soft/40'
                  : 'border-input-border'
              )}
              onDragOver={(e) => {
                if (!canAttach || submitting) {
                  return;
                }
                e.preventDefault();
                if (!draggingFiles) {
                  setDraggingFiles(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDraggingFiles(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDraggingFiles(false);
                if (!canAttach || submitting) {
                  return;
                }
                const files = Array.from(e.dataTransfer?.files || []);
                void uploadFiles(files);
              }}
            >
              {attachments.length > 0 && (
                <div className="NewPrototypeModal__attachments flex flex-wrap gap-1.5 px-3 pt-2.5">
                  {attachments.map((attachment, i) =>
                    attachment.mediaType.startsWith('image/') ? (
                      <div
                        key={`${attachment.url}-${i}`}
                        className="NewPrototypeModal__attachment relative size-14 overflow-hidden rounded-md border border-border bg-surface-hover"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.filename}
                          className="size-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${attachment.filename}`}
                          className="absolute top-0.5 right-0.5 flex size-4 cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-overlay p-0 text-inverse"
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                        >
                          <IconX size={10} />
                        </button>
                      </div>
                    ) : (
                      <div
                        key={`${attachment.url}-${i}`}
                        className="NewPrototypeModal__attachmentChip inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-hover py-1 pr-1 pl-2 text-xs text-fg"
                      >
                        <IconPaperclip
                          size={12}
                          className="shrink-0 text-muted"
                          aria-hidden="true"
                        />
                        <span className="truncate">{attachment.filename}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${attachment.filename}`}
                          className="inline-flex size-4 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                        >
                          <IconX size={11} />
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
              <textarea
                {...control}
                className="NewPrototypeModal__promptTextarea block w-full resize-y appearance-none border-0 bg-transparent px-3 py-2 font-sans text-base leading-normal text-input-fg outline-none placeholder:text-input-placeholder disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Explore two pricing page layouts with a 3-tier comparison matrix and FAQ band..."
                rows={3}
                disabled={submitting}
                value={initialPrompt}
                onInput={(e) => setInitialPrompt(e.currentTarget.value)}
                onPaste={(e) => {
                  if (!canAttach || submitting) {
                    return;
                  }
                  const items = e.clipboardData?.items || [];
                  const files: File[] = [];
                  for (const item of items) {
                    if (item.kind === 'file') {
                      const file = item.getAsFile();
                      if (file) {
                        files.push(file);
                      }
                    }
                  }
                  if (files.length > 0) {
                    void uploadFiles(files);
                  }
                }}
              />
              <div className="NewPrototypeModal__promptToolbar flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <IconButton
                    size="xs"
                    variant="subtle"
                    label={
                      canAttach
                        ? 'Attach file'
                        : "Model doesn't support attachments"
                    }
                    disabled={submitting || uploading || !canAttach}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? <Spinner size="sm" /> : <IconPaperclip />}
                  </IconButton>
                  <span className="text-xs text-muted">
                    {uploading
                      ? 'Uploading…'
                      : canAttach
                        ? 'Attach, paste, or drop files'
                        : "Selected model doesn't support attachments"}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={handleFileChange}
                  />
                </div>
              </div>
            </div>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
