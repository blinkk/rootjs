import {ActionIcon, Text, Tooltip} from '@mantine/core';
import {IconExternalLink} from '@tabler/icons-preact';
import {forwardRef} from 'preact/compat';
import * as schema from '../../../../core/schema.js';

/**
 * Dropdown item for a document-sourced select/multiselect: shows the option
 * label with optional smaller, dimmed help text beneath it (from `helpKey`).
 */
export const FieldSourceItem = forwardRef(
  (props: {label: string; description?: string; ref: any}) => {
    const {label, description, ...selectProps} = props;
    return (
      <div {...selectProps}>
        <Text size="sm">{label}</Text>
        {description && (
          <Text size="xs" color="dimmed">
            {description}
          </Text>
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
    <Tooltip label={label} position="top" withArrow>
      <ActionIcon
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
      >
        <IconExternalLink size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
