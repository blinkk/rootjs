import {Button, Modal, TextInput} from '@mantine/core';
import {useEffect, useRef} from 'preact/hooks';
import {route} from 'preact-router';
import './NewDocModal.css';

interface NewDocModalProps {
  collection: string;
  opened?: boolean;
  onClose?: () => void;
}

function isSlugValid(slug: string): boolean {
  return !!slug;
}

export function NewDocModal(props: NewDocModalProps) {
  const slugRef = useRef<HTMLInputElement>(null);

  function onClose() {
    if (props.onClose) {
      props.onClose();
    }
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    const slug = slugRef.current!.value;
    if (isSlugValid(slug)) {
      route(`/cms/content/${props.collection}/${slug}?new=true`);
    }
  }

  return (
    <Modal
      className="NewDocModal"
      opened={props.opened || false}
      onClose={() => onClose()}
      title={`${props.collection}: New doc`}
    >
      <div className="NewDocModal__body">
        Enter a slug for the new doc. The slug is the ID of the page and is
        what's used in the URL. Use only lowercase letters, numbers, and dashes.
      </div>

      <form onSubmit={(e) => onSubmit(e)}>
        <div className="NewDocModal__slug">
          <TextInput
            name="slug"
            ref={slugRef}
            placeholder="slug"
            autoComplete="off"
            size="xs"
          />
        </div>

        <div className="NewDocModal__buttons">
          <Button
            variant="outline"
            onClick={() => onClose()}
            type="button"
            size="xs"
            color="dark"
          >
            Cancel
          </Button>
          <Button variant="filled" type="submit" size="xs" color="dark">
            Submit
          </Button>
        </div>
      </form>
    </Modal>
  );
}
