import {IconSparkles} from '@tabler/icons-preact';
import type {JSX} from 'preact';
import {useEffect, useId, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import type {PrototypeBoardBundle} from '../../../../../shared/prototypes.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showErrorNotification} from '../../../../utils/notifications.js';
import {apiCreatePrototypeBoard} from '../../prototypes-client.js';

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
 * Modal dialog for creating a new UX prototype board, with AI model selection
 * and an optional initial Root AI prompt that auto-queues when the board opens.
 */
export function NewPrototypeModal(props: NewPrototypeModalProps) {
  const {route} = useLocation();
  const formId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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

  // Reset form fields and sync available AI models each time the dialog opens.
  useEffect(() => {
    if (!props.open) {
      return;
    }
    setTitle('');
    setDescription('');
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
    const trimmedPrompt = initialPrompt.trim();

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
        initialPrompt: trimmedPrompt || undefined,
      });
      props.onCreated?.(created);
      props.onClose();
      const targetUrl = trimmedPrompt
        ? `/cms/prototypes/${created.board.id}?prompt=${encodeURIComponent(
            trimmedPrompt
          )}`
        : `/cms/prototypes/${created.board.id}`;
      route(targetUrl);
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
          description="Optional. Queues automatically in Root AI as soon as the board opens."
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
