import type {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Button} from '../Button/Button.js';
import {Dialog, type DialogProps} from './Dialog.js';

type DemoProps = Omit<DialogProps, 'open' | 'onClose' | 'footer'> & {
  /** Label of the button that reopens the dialog. */
  trigger: string;
  /** Renders a Cancel / primary action footer with this label. */
  action?: string;
  children?: ComponentChildren;
};

/** A dialog that starts open, with a button to reopen it once closed. */
function DialogDemo(props: DemoProps) {
  const {trigger, action, children, ...dialogProps} = props;
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{trigger}</Button>
      <Dialog
        {...dialogProps}
        open={open}
        onClose={close}
        footer={
          action && (
            <>
              <Button onClick={close}>Cancel</Button>
              <Button variant="primary" onClick={close}>
                {action}
              </Button>
            </>
          )
        }
      >
        {children}
      </Dialog>
    </>
  );
}

const PARAGRAPHS = [
  'Every version of this doc is kept for 30 days. Restoring a version replaces the current draft; the published doc is unchanged until you publish again.',
  'Versions are saved automatically every few minutes while you edit, and each time the doc is published, scheduled or restored.',
  'Translations and comments are not part of a version, so restoring one keeps them as they are now.',
];

export const DialogGallery = defineGallery({
  id: 'dialog',
  name: 'Dialog',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    Default: () => (
      <DialogDemo
        trigger="Rename doc"
        title="Rename doc"
        description="The new slug is used in the doc's URL."
        action="Rename"
      >
        <p className="m-0">
          Links to <code>pages/about</code> keep working: a redirect is added
          from the old URL.
        </p>
      </DialogDemo>
    ),
    'Long content (lg)': () => (
      <DialogDemo
        trigger="Version history"
        title="Version history: pages/index"
        size="lg"
        action="Restore"
      >
        <div className="flex flex-col gap-4">
          {Array.from({length: 12}, (_, i) => (
            <p key={i} className="m-0">
              {PARAGRAPHS[i % PARAGRAPHS.length]}
            </p>
          ))}
        </div>
      </DialogDemo>
    ),
    'Centered, no close button': () => (
      <DialogDemo
        trigger="Session expired"
        title="Your session expired"
        size="sm"
        centered
        withCloseButton={false}
        closeOnEscape={false}
        closeOnClickOutside={false}
        action="Sign in again"
      >
        <p className="m-0 text-muted">
          Sign in to keep editing. Your unsaved changes are kept.
        </p>
      </DialogDemo>
    ),
  },
});
