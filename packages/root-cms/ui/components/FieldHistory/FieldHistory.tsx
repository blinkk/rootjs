/** @fileoverview Displays the version history of a single field. */

import {ActionIcon, Loader, Tooltip} from '@mantine/core';
import {IconLanguage} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {RichTextData} from '../../../shared/richtext.js';
import {cmsListVersions, cmsReadDocVersion} from '../../utils/doc.js';
import {sourceHash} from '../../utils/l10n.js';
import {getNestedValue} from '../../utils/objects.js';
import {LexicalReadOnly} from '../RichTextEditor/lexical/LexicalReadOnly.js';
import './FieldHistory.css';

interface FieldVersion {
  /** The raw field value (could be string, RichTextData, object, etc.). */
  rawValue: unknown;
  /** A string representation used for deduplication. */
  valueKey: string;
  modifiedBy: string;
  modifiedAt: Date;
  versionId: string;
}

export interface FieldHistoryProps {
  /** The document ID (e.g. "Pages/home"). */
  docId: string;
  /** The deep key for the field (e.g. "fields.meta.title"). */
  deepKey: string;
  /** Whether the field is translatable (i18n locales are configured). */
  translatable?: boolean;
}

/**
 * Shows the history of a specific field across document versions, displaying
 * the value, who edited it, and when.
 */
export function FieldHistory(props: FieldHistoryProps) {
  const {docId, deepKey, translatable} = props;
  const [loading, setLoading] = useState(true);
  const [fieldVersions, setFieldVersions] = useState<FieldVersion[]>([]);

  const dateFormat = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  useEffect(() => {
    async function fetchFieldHistory() {
      setLoading(true);
      const [versions, draftDoc] = await Promise.all([
        cmsListVersions(docId),
        cmsReadDocVersion(docId, 'draft'),
      ]);

      const entries: FieldVersion[] = [];

      // Add the current draft as the first entry.
      if (draftDoc) {
        const draftValue = getNestedValue(draftDoc, deepKey);
        entries.push({
          rawValue: draftValue,
          valueKey: toValueKey(draftValue),
          modifiedBy: draftDoc.sys?.modifiedBy || 'Unknown',
          modifiedAt: draftDoc.sys?.modifiedAt?.toDate?.() || new Date(),
          versionId: 'draft',
        });
      }

      // Add each saved version.
      for (const version of versions) {
        const value = getNestedValue(version, deepKey);
        entries.push({
          rawValue: value,
          valueKey: toValueKey(value),
          modifiedBy: version.sys?.modifiedBy || 'Unknown',
          modifiedAt: version.sys?.modifiedAt?.toDate?.() || new Date(),
          versionId: version._versionId,
        });
      }

      // Deduplicate consecutive entries with the same value.
      const deduped: FieldVersion[] = [];
      for (const entry of entries) {
        const prev = deduped[deduped.length - 1];
        if (!prev || prev.valueKey !== entry.valueKey) {
          deduped.push(entry);
        }
      }

      setFieldVersions(deduped);
      setLoading(false);
    }

    fetchFieldHistory();
  }, [docId, deepKey]);

  if (loading) {
    return (
      <div className="FieldHistory__loading">
        <Loader size="sm" />
      </div>
    );
  }

  if (fieldVersions.length === 0) {
    return <div className="FieldHistory__empty">No history available.</div>;
  }

  return (
    <div className="FieldHistory">
      {fieldVersions.map((entry, i) => (
        <div className="FieldHistory__entry" key={entry.versionId}>
          <div className="FieldHistory__entry__header">
            <span className="FieldHistory__entry__author">
              {entry.modifiedBy}
            </span>
            <span className="FieldHistory__entry__date">
              {dateFormat.format(entry.modifiedAt)}
            </span>
            {i === 0 && (
              <span className="FieldHistory__entry__badge">Current</span>
            )}
            {translatable && entry.valueKey && (
              <span className="FieldHistory__entry__translationsLink">
                <TranslationsLink value={entry.valueKey} />
              </span>
            )}
          </div>
          <FieldValueDisplay rawValue={entry.rawValue} />
        </div>
      ))}
    </div>
  );
}

/** Opens the translations page for a given string value. */
function TranslationsLink(props: {value: string}) {
  const [href, setHref] = useState<string>('');

  useEffect(() => {
    sourceHash(props.value).then((hash) => {
      setHref(`/cms/translations/${hash}`);
    });
  }, [props.value]);

  if (!href) {
    return null;
  }

  return (
    <Tooltip label="Open in Translations Editor" withArrow position="right">
      <ActionIcon
        component="a"
        href={href}
        target="_blank"
        variant="transparent"
        size="sm"
      >
        <IconLanguage size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** Renders the value for a history entry. */
function FieldValueDisplay(props: {rawValue: unknown}) {
  const {rawValue} = props;
  if (isRichTextData(rawValue)) {
    return (
      <div className="FieldHistory__entry__value FieldHistory__entry__value--richtext">
        <LexicalReadOnly
          className="FieldHistory__entry__lexical"
          value={rawValue as RichTextData}
        />
      </div>
    );
  }
  const formatted = formatFieldValue(rawValue);
  return (
    <div className="FieldHistory__entry__value">
      {formatted || <span className="FieldHistory__entry__empty">(empty)</span>}
    </div>
  );
}

/** Checks if a value looks like RichTextData. */
function isRichTextData(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as any).blocks)
  );
}

/** Produces a stable string key for deduplication. */
function toValueKey(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

/** Converts a field value to a display string. */
function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatFieldValue(item)).join(', ');
  }
  if (isImageValue(value)) {
    return formatImageValue(value);
  }
  return JSON.stringify(value);
}

/** Checks if a value looks like an image field object. */
function isImageValue(
  value: unknown
): value is {src?: string; alt?: string; url?: string} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.src === 'string' || typeof obj.url === 'string';
}

/** Formats an image field value. */
function formatImageValue(value: {
  src?: string;
  alt?: string;
  url?: string;
}): string {
  const src = value.src || value.url || '';
  const alt = value.alt || '';
  if (alt) {
    return `${src}\nalt: ${alt}`;
  }
  return src;
}
