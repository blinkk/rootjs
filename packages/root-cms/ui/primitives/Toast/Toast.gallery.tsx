import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Button} from '../Button/Button.js';
import {Dialog} from '../Dialog/Dialog.js';
import {Toaster} from './Toast.js';
import {createToastStore, type ToastOptions} from './toastStore.js';

/** A `Toaster` with its own store, prefilled with `toasts`. */
function ToasterDemo(props: {toasts: ToastOptions[]; withDialog?: boolean}) {
  const [dialogOpen, setDialogOpen] = useState(Boolean(props.withDialog));
  const [store] = useState(() => {
    const s = createToastStore();
    props.toasts.forEach((toast) => s.show(toast));
    return s;
  });
  return (
    <>
      <Button
        onClick={() =>
          store.show({
            title: 'Saved',
            message: 'Your changes were saved.',
            color: 'green',
          })
        }
      >
        Show a toast
      </Button>
      {props.withDialog && (
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Delete doc"
        >
          <p className="m-0">
            Toasts render inside the topmost open dialog, so they stay above it
            and clickable.
          </p>
        </Dialog>
      )}
      <Toaster store={store} />
    </>
  );
}

export const ToastGallery = defineGallery({
  id: 'toast',
  name: 'Toast',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    'Every color': () => (
      <ToasterDemo
        toasts={[
          {
            title: 'Publishing pages/index',
            message: 'This may take a few seconds.',
            color: 'blue',
            loading: true,
            autoClose: false,
            disallowClose: true,
          },
          {
            title: 'Published',
            message: 'pages/index is live.',
            color: 'green',
            autoClose: false,
          },
          {
            title: 'Scheduled with warnings',
            message: '2 images are missing alt text.',
            color: 'yellow',
            autoClose: false,
          },
          {
            title: 'Failed to publish',
            message:
              'permission-denied: Missing or insufficient permissions. Ask an admin for the EDITOR role on this project, then try again. (Error ID: 7f3a9c)',
            color: 'red',
            autoClose: false,
          },
          {
            message: (
              <div className="flex items-center justify-between gap-3">
                <span>Section cleared.</span>
                <Button size="xs">Undo</Button>
              </div>
            ),
            autoClose: false,
          },
        ]}
      />
    ),
    'Over a dialog': () => (
      <ToasterDemo
        withDialog
        toasts={[
          {
            title: 'Failed to delete doc',
            message: 'permission-denied: Missing or insufficient permissions.',
            color: 'red',
            autoClose: false,
          },
        ]}
      />
    ),
  },
});
