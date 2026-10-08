/** @fileoverview Displays the version history of a single field. */

import {ActionIcon, Loader, Tooltip} from '@mantine/core';
import {IconLanguage} from '@tabler/icons-preact';
import {diffWordsWithSpace} from 'diff';
import {useEffect, useState} from 'preact/hooks';
import {isRichTextData} from '../../../shared/marshal.js';
import {
  RichTextData,
  testSameRichTextContent,
} from '../../../shared/richtext.js';
import {richTextToPlainText} from '../../utils/doc-changes.js';
import {cmsListVersions, cmsReadDocVersion} from '../../utils/doc.js';
import {sourceHash} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';
import {getNestedValue} from '../../utils/objects.js';
import {withTimeout} from '../../utils/with-timeout.js';
import './FieldHistory.css';

/**
 * Below this ratio of unchanged text, a word diff is harder to read than the
 * new text on its own, so the diff is skipped (the previous version is shown
 * just below it in the list).
 */
const MIN_DIFF_SIMILARITY = 0.4;

interface FieldVersion {
  /** The raw field value. */
  value: unknown;
  /** The value as human-readable text. */
  text: string;
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
      await notifyErrors(fetchFieldHistoryInner);
      setLoading(false);
    }

    async function fetchFieldHistoryInner() {
      const [versionsResult, draftDoc] = await withTimeout(
        Promise.all([
          cmsListVersions(docId),
          cmsReadDocVersion(docId, 'draft'),
        ]),
        undefined,
        'loading field history'
      );
      const versions = versionsResult.versions;

      const entries: FieldVersion[] = [];

      // Add the current draft as the first entry.
      if (draftDoc) {
        const draftValue = getNestedValue(draftDoc, deepKey);
        entries.push({
          value: draftValue,
          text: formatFieldValue(draftValue),
          modifiedBy: draftDoc.sys?.modifiedBy || 'Unknown',
          modifiedAt: draftDoc.sys?.modifiedAt?.toDate?.() || new Date(),
          versionId: 'draft',
        });
      }

      // Add each saved version.
      for (const version of versions) {
        const value = getNestedValue(version, deepKey);
        entries.push({
          value: value,
          text: formatFieldValue(value),
          modifiedBy: version.sys?.modifiedBy || 'Unknown',
          modifiedAt: version.sys?.modifiedAt?.toDate?.() || new Date(),
          versionId: version._versionId,
        });
      }

      // Deduplicate consecutive entries with the same value.
      const deduped: FieldVersion[] = [];
      for (const entry of entries) {
        const prev = deduped[deduped.length - 1];
        if (!prev || !testSameFieldValue(prev, entry)) {
          deduped.push(entry);
        }
      }

      setFieldVersions(deduped);
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
            {translatable && typeof entry.value === 'string' && entry.value && (
              <span className="FieldHistory__entry__translationsLink">
                <TranslationsLink value={entry.value} />
              </span>
            )}
          </div>
          <FieldValue entry={entry} prevEntry={fieldVersions[i + 1]} />
        </div>
      ))}
    </div>
  );
}

/**
 * Renders a field version's value. Rich text is shown as plain text, with the
 * words added or removed since the previous version highlighted.
 */
function FieldValue(props: {entry: FieldVersion; prevEntry?: FieldVersion}) {
  const {entry, prevEntry} = props;
  if (!entry.text) {
    return (
      <div className="FieldHistory__entry__value">
        <span className="FieldHistory__entry__empty">(empty)</span>
      </div>
    );
  }
  if (!isRichTextData(entry.value) || !prevEntry?.text) {
    return <div className="FieldHistory__entry__value">{entry.text}</div>;
  }
  if (entry.text === prevEntry.text) {
    return (
      <div className="FieldHistory__entry__value">
        <div className="FieldHistory__entry__note">
          Only the formatting or embedded content changed.
        </div>
        {entry.text}
      </div>
    );
  }
  const parts = diffWordsWithSpace(prevEntry.text, entry.text);
  const unchangedLength = parts
    .filter((part) => !part.added && !part.removed)
    .reduce((total, part) => total + part.value.length, 0);
  const similarity =
    unchangedLength / Math.max(prevEntry.text.length, entry.text.length, 1);
  if (similarity < MIN_DIFF_SIMILARITY) {
    return <div className="FieldHistory__entry__value">{entry.text}</div>;
  }
  return (
    <div className="FieldHistory__entry__value">
      {parts.map((part, i) => {
        if (part.added) {
          return <ins key={i}>{part.value}</ins>;
        }
        if (part.removed) {
          return <del key={i}>{part.value}</del>;
        }
        return <span key={i}>{part.value}</span>;
      })}
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
  if (isRichTextData(value)) {
    return richTextToPlainText(value as RichTextData);
  }
  return JSON.stringify(value);
}

/**
 * Returns true if two field versions hold the same value. Rich text is
 * compared by its blocks, ignoring the `time` that changes on every save.
 */
function testSameFieldValue(a: FieldVersion, b: FieldVersion): boolean {
  if (isRichTextData(a.value) && isRichTextData(b.value)) {
    return testSameRichTextContent(
      a.value as RichTextData,
      b.value as RichTextData
    );
  }
  return a.text === b.text;
}
