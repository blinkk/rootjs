import {IconExternalLink} from '@tabler/icons-preact';
import {forwardRef} from 'preact/compat';
import * as schema from '../../../../../../core/schema.js';
import {IconButton} from '../../../../../primitives/IconButton/IconButton.js';

/**
 * Dropdown item for a document-sourced select/multiselect: shows the option
 * label with optional smaller, dimmed help text beneath it (from `helpKey`).
 * The `Select` primitive shows an option's `description` on its own; this is
 * kept for dropdowns that take an item component.
 */
export const FieldSourceItem = forwardRef(
  (props: {label: string; description?: string; ref: any}) => {
    const {label, description, ...selectProps} = props;
    return (
      <div {...selectProps}>
        <div className="FieldSourceItem__label text-base">{label}</div>
        {description && (
          <div className="FieldSourceItem__description text-sm text-muted">
            {description}
          </div>
        )}
      </div>
    );
  }
);

interface SourceDocButtonProps {
  source?: schema.FieldValueSource;
}

/**
 * Icon button that opens the source document's editor in a new tab. Renders
 * nothing unless the field is sourced from a document.
 */
export function SourceDocButton(props: SourceDocButtonProps) {
  const source = props.source;
  if (!source || !source.doc) {
    return null;
  }
  const label = `Open ${source.doc}`;
  let href = `/cms/content/${source.doc}`;
  if (source.field) {
    // Deep-link to the source field within the doc editor, e.g.
    // `?deeplink=fields.flags`.
    const deepKey = `fields.${source.field}`;
    href += `?deeplink=${encodeURIComponent(deepKey)}`;
  }
  return (
    <IconButton
      className="SourceDocButton"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      label={label}
    >
      <IconExternalLink />
    </IconButton>
  );
}
