import type {ComponentChildren} from 'preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {LoadingOverlay} from './LoadingOverlay.js';

function SampleForm(props: {children?: ComponentChildren}) {
  return (
    <div className="relative flex max-w-md flex-col gap-2 rounded-lg border border-solid border-border bg-surface p-4 text-sm">
      <strong className="text-strong">Release details</strong>
      <span>ID: spring-launch</span>
      <span className="text-muted">
        Ships the new homepage, pricing and docs landing pages together.
      </span>
      {props.children}
    </div>
  );
}

export const LoadingOverlayGallery = defineGallery({
  id: 'loading-overlay',
  name: 'LoadingOverlay',
  group: 'Primitives',
  stories: {
    Visible: () => (
      <SampleForm>
        <LoadingOverlay visible />
      </SampleForm>
    ),
    'With a label': () => (
      <SampleForm>
        <LoadingOverlay visible label="Saving…" showLabel spinnerSize="md" />
      </SampleForm>
    ),
    Hidden: () => (
      <SampleForm>
        <LoadingOverlay visible={false} />
      </SampleForm>
    ),
  },
});
