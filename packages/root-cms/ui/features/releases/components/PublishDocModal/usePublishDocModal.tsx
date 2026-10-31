import {IconRocket} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {PublishDocModalProps} from './PublishDocModal.js';

export const PUBLISH_DOC_MODAL_ID = 'PublishDocModal';

/** A modal title with a leading icon. */
export function ModalTitle(props: {
  icon: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <span className="PublishDocModal__title flex min-w-0 items-center gap-2">
      <span className="PublishDocModal__titleIcon flex shrink-0">
        {props.icon}
      </span>
      <span className="PublishDocModal__titleText wrap-anywhere">
        {props.children}
      </span>
    </span>
  );
}

/** Hook for opening the publish doc modal. */
export function usePublishDocModal(props: PublishDocModalProps) {
  const modals = useModals();
  return {
    open: () => {
      modals.openContextModal(PUBLISH_DOC_MODAL_ID, {
        title: (
          <ModalTitle icon={<IconRocket size={18} stroke={1.75} />}>
            Publish {props.docId}
          </ModalTitle>
        ),
        innerProps: props,
        size: '640px',
      });
    },
  };
}
