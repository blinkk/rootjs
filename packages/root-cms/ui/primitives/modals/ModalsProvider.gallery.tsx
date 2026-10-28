import {useEffect} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Button} from '../Button/Button.js';
import {
  type ContextModalProps,
  ModalsProvider,
  useModals,
} from './ModalsProvider.js';

interface RenameModalProps {
  docId: string;
}

/** An example context modal, as feature code registers them. */
function RenameModal(props: ContextModalProps<RenameModalProps>) {
  const {context, id, innerProps} = props;
  const modals = useModals();
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">
        Rename <code>{innerProps.docId}</code>. Links to the old slug redirect
        to the new one.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => context.closeModal(id)}>Cancel</Button>
        <Button
          variant="danger"
          onClick={() =>
            modals.openConfirmModal({
              title: `Delete ${innerProps.docId}`,
              children: <p className="m-0">There is no undo.</p>,
              labels: {confirm: 'Delete', cancel: 'Cancel'},
              cancelProps: {size: 'xs'},
              confirmProps: {color: 'red', size: 'xs'},
              onConfirm: () => context.closeModal(id),
            })
          }
        >
          Delete instead
        </Button>
        <Button variant="primary" onClick={() => context.closeModal(id)}>
          Rename
        </Button>
      </div>
    </div>
  );
}

const MODALS = {RenameModal};

type Opener = (modals: ReturnType<typeof useModals>) => void;

/** Opens modals on mount, and again from a button once closed. */
function Demo(props: {label: string; open: Opener}) {
  const modals = useModals();
  useEffect(() => props.open(modals), []);
  return <Button onClick={() => props.open(modals)}>{props.label}</Button>;
}

function openConfirm(modals: ReturnType<typeof useModals>) {
  modals.openConfirmModal({
    title: 'Unpublish pages/about',
    children: (
      <p className="m-0">
        Are you sure you want to unpublish the following doc? There is no undo.
      </p>
    ),
    labels: {confirm: 'Unpublish', cancel: 'Cancel'},
    cancelProps: {size: 'xs'},
    confirmProps: {color: 'red', size: 'xs'},
  });
}

function openRename(modals: ReturnType<typeof useModals>) {
  modals.openContextModal<RenameModalProps>('RenameModal', {
    title: 'Rename doc',
    size: '600px',
    innerProps: {docId: 'pages/about'},
  });
}

export const ModalsGallery = defineGallery({
  id: 'modals',
  name: 'Modals',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    'Confirm modal': () => (
      <ModalsProvider>
        <Demo label="Unpublish" open={openConfirm} />
      </ModalsProvider>
    ),
    'Context modal': () => (
      <ModalsProvider modals={MODALS}>
        <Demo label="Rename" open={openRename} />
      </ModalsProvider>
    ),
    'Stacked (confirm over a context modal)': () => (
      <ModalsProvider modals={MODALS}>
        <Demo
          label="Rename"
          open={(modals) => {
            openRename(modals);
            modals.openConfirmModal({
              title: 'Discard changes?',
              children: (
                <p className="m-0">Your edits to the slug will be lost.</p>
              ),
              labels: {confirm: 'Discard', cancel: 'Keep editing'},
              confirmProps: {color: 'red'},
              centered: true,
              size: 'sm',
            });
          }}
        />
      </ModalsProvider>
    ),
  },
});
