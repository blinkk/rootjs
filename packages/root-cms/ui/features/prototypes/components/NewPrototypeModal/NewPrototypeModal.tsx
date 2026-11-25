import {IconFileText, IconSparkles, IconX} from '@tabler/icons-preact';
import type {JSX} from 'preact';
import {useEffect, useId, useMemo, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import type {PrototypeBoardBundle} from '../../../../../shared/prototypes.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showErrorNotification} from '../../../../utils/notifications.js';
import {useDocPickerModal} from '../../../collections/components/DocPickerModal/useDocPickerModal.js';
import {
  apiCreatePrototypeBoard,
  storeInitialPrototypePrompt,
} from '../../prototypes-client.js';

const SELECTED_MODEL_STORAGE_KEY = 'root-cms.ai.selectedModel';

interface ModalModelOption {
  id: string;
  label: string;
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
      models: ctxAi.models.map((m) => ({id: m.id, label: m.label})),
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

  // Reset form fields and sync available AI models each time the dialog opens.
  useEffect(() => {
    if (!props.open) {
      return;
    }
    setTitle('');
    setDescription('');
    setSeedDocId('');
    setInitialPrompt('');
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
    if (submitting) {
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
      if (effectivePrompt) {
        storeInitialPrototypePrompt(created.board.id, effectivePrompt);
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
        <Textarea
          className="NewPrototypeModal__promptInput"
          label={
            <span className="NewPrototypeModal__promptLabel inline-flex items-center gap-1.5">
              <span>Initial AI prompt</span>
              <Badge
                tone="violet"
                variant="soft"
                size="xs"
                icon={<IconSparkles />}
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
          placeholder="Explore two pricing page layouts with a 3-tier comparison matrix and FAQ band..."
          size="md"
          autosize
          minRows={3}
          maxRows={6}
          disabled={submitting}
          value={initialPrompt}
          onInput={(e) => setInitialPrompt(e.currentTarget.value)}
        />
      </form>
    </Dialog>
  );
}
