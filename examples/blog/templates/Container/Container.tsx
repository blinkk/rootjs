import {ContainerFields} from '@/root-cms.js';

/**
 * Container component that renders nested templates.
 *
 * This component supports recursive nesting, allowing Containers to be placed
 * inside other Containers for complex layouts.
 */
export function Container(props: ContainerFields) {
  const layoutClass = `Container--${props.layout || 'stack'}`;

  return (
    <section className={`Container ${layoutClass}`} id={props.id || undefined}>
      {props.title && <h2 className="Container__title">{props.title}</h2>}
      <div className="Container__children">
        {/* Children are rendered by the parent template system. */}
      </div>
    </section>
  );
}
