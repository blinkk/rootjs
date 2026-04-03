/** @fileoverview Displays the version history of a single field. */

import {ActionIcon, Loader, Tooltip} from '@mantine/core';
import {IconLanguage} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {cmsListVersions, cmsReadDocVersion} from '../../utils/doc.js';
import {sourceHash} from '../../utils/l10n.js';
import {getNestedValue} from '../../utils/objects.js';
import './FieldHistory.css';

interface FieldVersion {
  value: string;
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
      const [versionsResult, draftDoc] = await Promise.all([
        cmsListVersions(docId),
        cmsReadDocVersion(docId, 'draft'),
      ]);
      const versions = versionsResult.versions;

      const entries: FieldVersion[] = [];

      // Add the current draft as the first entry.
      if (draftDoc) {
        const draftValue = getNestedValue(draftDoc, deepKey);
        entries.push({
          value: formatFieldValue(draftValue),
          modifiedBy: draftDoc.sys?.modifiedBy || 'Unknown',
          modifiedAt: draftDoc.sys?.modifiedAt?.toDate?.() || new Date(),
          versionId: 'draft',
        });
      }

      // Add each saved version.
      for (const version of versions) {
        const value = getNestedValue(version, deepKey);
        entries.push({
          value: formatFieldValue(value),
          modifiedBy: version.sys?.modifiedBy || 'Unknown',
          modifiedAt: version.sys?.modifiedAt?.toDate?.() || new Date(),
          versionId: version._versionId,
        });
      }

      // Deduplicate consecutive entries with the same value.
      const deduped: FieldVersion[] = [];
      for (const entry of entries) {
        const prev = deduped[deduped.length - 1];
        if (!prev || prev.value !== entry.value) {
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
            {translatable && entry.value && (
              <span className="FieldHistory__entry__translationsLink">
                <TranslationsLink value={entry.value} />
              </span>
            )}
          </div>
          <div className="FieldHistory__entry__value">
            {entry.value || (
              <span className="FieldHistory__entry__empty">(empty)</span>
            )}
          </div>
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

/** Converts a field value to a display string. */
function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
