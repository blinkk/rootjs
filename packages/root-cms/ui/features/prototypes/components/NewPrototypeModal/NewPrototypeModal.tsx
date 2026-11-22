import {IconSparkles} from '@tabler/icons-preact';
import type {JSX} from 'preact';
import {useEffect, useId, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import type {PrototypeBoardBundle} from '../../../../../shared/prototypes.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showErrorNotification} from '../../../../utils/notifications.js';
import {apiCreatePrototypeBoard} from '../../prototypes-client.js';

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
 * Modal dialog for creating a new UX prototype board, with an optional initial
 * Root AI prompt that auto-queues when the board opens.
 */
export function NewPrototypeModal(props: NewPrototypeModalProps) {
  const {route} = useLocation();
  const formId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [titleError, setTitleError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form fields each time the dialog opens so prior input does not linger.
  useEffect(() => {
    if (props.open) {
      setTitle('');
      setDescription('');
      setInitialPrompt('');
      setTitleError('');
      setSubmitting(false);
    }
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
