import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Loader,
  Select,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowsTransferDown,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {
  ReplaceRule,
  applyReplaceRule,
  classifySourceChange,
  diffStrings,
  findPlaceholderMismatches,
  getSourceHunks,
  portTranslation,
  rankBySimilarity,
} from '../../../shared/translation-port.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {logAction} from '../../utils/actions.js';
import {joinClassNames} from '../../utils/classes.js';
import {getTranslationForLanguage} from '../../utils/l10n.js';
import {Text} from '../Text/Text.js';
import './PortTranslationsModal.css';

const MODAL_ID = 'PortTranslationsModal';

/**
 * Candidates scoring at least this similarity are preselected when the modal
 * opens.
 */
const PRESELECT_MIN_SCORE = 0.5;

/** A source string that translations can be ported from. */
export interface PortTranslationsCandidate {
  source: string;
  /** Translations keyed by root locale (or translation language). */
  translations: Record<string, string>;
  /** Optional short label, e.g. "unused". */
  label?: string;
}

export interface PortTranslationsModalProps {
  [key: string]: unknown;
  /** The translations id (or doc id) the target string belongs to. */
  id: string;
  /** The source string to port translations to. */
  targetSource: string;
  /** Existing translations for the target, keyed by root locale. */
  targetTranslations: Record<string, string>;
  /** The translation languages to port. */
  languages: string[];
  /** Loads the source strings to port translations from. */
  loadCandidates: () => Promise<PortTranslationsCandidate[]>;
  /**
   * Looks up the translations (keyed by root locale) for an exact source
   * string that isn't in the candidates list. Returns `null` if not found.
   */
  lookupSource: (source: string) => Promise<Record<string, string> | null>;
  /** Saves the ported translations, keyed by translation language. */
  onSave: (translations: Record<string, string>) => Promise<void>;
}

/** Hook that returns an `open()` function for launching the port modal. */
export function usePortTranslationsModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (innerProps: PortTranslationsModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: 'Port translations',
        innerProps,
        size: 'clamp(80%, 960px, 1200px)',
      });
    },
  };
}

/**
 * Modal for porting the translations of one source string to another, e.g.
 * after a source string is edited slightly. Translations can optionally be
 * transformed by carrying over the source edits and by find/replace rules.
 */
export function PortTranslationsModal(
  modalProps: ContextModalProps<PortTranslationsModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<PortTranslationsCandidate[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [lookupValue, setLookupValue] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [carryOver, setCarryOver] = useState(true);
  const [rules, setRules] = useState<ReplaceRule[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const rankedCandidates = useMemo(
    () => rankBySimilarity(props.targetSource, candidates),
    [props.targetSource, candidates]
  );

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.source === selectedSource) || null,
    [candidates, selectedSource]
  );

  useEffect(() => {
    let cancelled = false;
    props
      .loadCandidates()
      .then((results) => {
        if (cancelled) {
          return;
        }
        const filtered = results.filter(
          (c) =>
            c.source !== props.targetSource &&
            props.languages.some((lang) =>
              getTranslationForLanguage(c.translations, lang)
            )
        );
        setCandidates(filtered);
        const top = rankBySimilarity(props.targetSource, filtered)[0];
        if (top && top.score >= PRESELECT_MIN_SCORE) {
          selectSource(top.source, filtered);
        }
      })
      .catch((err) => {
        console.error(err);
        showNotification({
          title: 'Failed to load source strings',
          message: String(err?.message || err),
          color: 'red',
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Selects a source string to port from, and selects the languages it has
   * translations for that the target is missing.
   */
  function selectSource(
    source: string | null,
    candidatesList: PortTranslationsCandidate[] = candidates
  ) {
    setSelectedSource(source);
    setOverrides({});
    const candidate = candidatesList.find((c) => c.source === source);
    const langs = new Set<string>();
    if (candidate) {
      props.languages.forEach((lang) => {
        const from = getTranslationForLanguage(candidate.translations, lang);
        const existing = getTranslationForLanguage(
          props.targetTranslations,
          lang
        );
        if (from && !existing) {
          langs.add(lang);
        }
      });
    }
    setSelectedLangs(langs);
  }

  async function lookup() {
    const source = lookupValue.trim();
    if (!source) {
      return;
    }
    const existing = candidates.find((c) => c.source === source);
    if (existing) {
      selectSource(existing.source);
      setLookupValue('');
      return;
    }
    setLookingUp(true);
    try {
      const translations = await props.lookupSource(source);
      if (!translations) {
        showNotification({
          title: 'No translations found',
          message: 'No translations were found for that source string.',
          color: 'yellow',
        });
        return;
      }
      const candidate = {source, translations, label: 'lookup'};
      const newCandidates = [...candidates, candidate];
      setCandidates(newCandidates);
      selectSource(source, newCandidates);
      setLookupValue('');
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Lookup failed',
        message: String((err as Error)?.message || err),
        color: 'red',
      });
    } finally {
      setLookingUp(false);
    }
  }

  const ruleErrors = useMemo(
    () => rules.map((rule) => applyReplaceRule('', rule).error),
    [rules]
  );
  const validRules = useMemo(
    () => rules.filter((rule, i) => rule.find && !ruleErrors[i]),
    [rules, ruleErrors]
  );

  const rows = useMemo(() => {
    if (!selectedCandidate) {
      return [];
    }
    return props.languages.map((lang) => {
      const from = getTranslationForLanguage(
        selectedCandidate.translations,
        lang
      );
      const existing = getTranslationForLanguage(
        props.targetTranslations,
        lang
      );
      const result = portTranslation({
        oldSource: selectedCandidate.source,
        newSource: props.targetSource,
        translation: from,
        carryOverSourceEdits: carryOver,
        rules: validRules,
      });
      const overridden = lang in overrides;
      const value = overridden ? overrides[lang] : result.text;
      return {
        lang,
        from,
        existing,
        value,
        overridden,
        modified: Boolean(from) && value !== from,
        placeholders: value
          ? findPlaceholderMismatches(props.targetSource, value)
          : {missing: [], extra: []},
        changes: result.changes,
      };
    });
  }, [
    selectedCandidate,
    props.languages,
    props.targetSource,
    props.targetTranslations,
    carryOver,
    validRules,
    overrides,
  ]);

  // For each source change, count the languages it was carried over to.
  const sourceChanges = useMemo(() => {
    if (!selectedCandidate) {
      return [];
    }
    const hunks = getSourceHunks(
      selectedCandidate.source,
      props.targetSource
    ).filter((hunk) => hunk.oldText.trim() || hunk.newText.trim());
    const rowsWithFrom = rows.filter((row) => row.from);
    return hunks.map((hunk, i) => ({
      ...hunk,
      appliedCount: rowsWithFrom.filter(
        (row) => row.changes[i]?.status === 'applied'
      ).length,
      total: rowsWithFrom.length,
    }));
  }, [selectedCandidate, props.targetSource, rows]);

  const changeType = selectedCandidate
    ? classifySourceChange(selectedCandidate.source, props.targetSource)
    : null;

  const rowsToSave = rows.filter(
    (row) => selectedLangs.has(row.lang) && row.value.trim()
  );

  function toggleLang(lang: string, checked: boolean) {
    setSelectedLangs((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(lang);
      } else {
        next.delete(lang);
      }
      return next;
    });
  }

  function updateRule(index: number, updates: Partial<ReplaceRule>) {
    setRules((current) =>
      current.map((rule, i) => (i === index ? {...rule, ...updates} : rule))
    );
  }

  async function onSave() {
    if (!selectedCandidate || rowsToSave.length === 0) {
      return;
    }
    setSaving(true);
    try {
      const translations: Record<string, string> = {};
      rowsToSave.forEach((row) => {
        translations[row.lang] = row.value;
      });
      await props.onSave(translations);
      logAction('translations.port', {
        metadata: {
          id: props.id,
          fromSource: selectedCandidate.source,
          toSource: props.targetSource,
          languages: Object.keys(translations),
          carryOverSourceEdits: carryOver,
          rules: validRules,
        },
      });
      showNotification({
        title: 'Ported translations',
        message: `Ported ${rowsToSave.length} translation(s).`,
        color: 'green',
        autoClose: 5000,
      });
      context.closeModal(id);
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Error porting translations',
        message: String((err as Error)?.message || err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSaving(false);
    }
  }

  const selectData = rankedCandidates.map((c) => ({
    value: c.source,
    label: `${Math.round(c.score * 100)}% · ${truncate(c.source, 120)}${
      c.label ? ` (${c.label})` : ''
    }`,
  }));

  return (
    <div className="PortTranslationsModal">
      <Text size="body-sm" color="gray">
        Copy the translations of an existing source string to this string, e.g.
        after the source string was edited slightly. Review the ported
        translations below before saving.
      </Text>

      <div className="PortTranslationsModal__section">
        <div className="PortTranslationsModal__label">Port to</div>
        <div className="PortTranslationsModal__source">
          {props.targetSource}
        </div>
      </div>

      <div className="PortTranslationsModal__section">
        <div className="PortTranslationsModal__label">Port from</div>
        {loading ? (
          <div className="PortTranslationsModal__loading">
            <Loader color="gray" size="sm" />
          </div>
        ) : (
          <>
            <Select
              size="xs"
              searchable
              clearable
              placeholder={
                selectData.length > 0
                  ? 'Select a source string'
                  : 'No other translated strings found, look one up below'
              }
              nothingFound="No matching strings"
              data={selectData}
              value={selectedSource}
              onChange={(value: string | null) => selectSource(value)}
            />
            <div className="PortTranslationsModal__lookup">
              <TextInput
                className="PortTranslationsModal__lookup__input"
                size="xs"
                placeholder="Or paste the exact old source string to look it up"
                value={lookupValue}
                onChange={(e: Event) =>
                  setLookupValue((e.target as HTMLInputElement).value)
                }
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    lookup();
                  }
                }}
              />
              <Button
                variant="default"
                size="xs"
                leftIcon={<IconSearch size={14} />}
                loading={lookingUp}
                disabled={!lookupValue.trim()}
                onClick={() => lookup()}
              >
                Look up
              </Button>
            </div>
          </>
        )}
      </div>

      {selectedCandidate && (
        <>
          <div className="PortTranslationsModal__section">
            <div className="PortTranslationsModal__label">Source changes</div>
            <SourceDiff
              oldSource={selectedCandidate.source}
              newSource={props.targetSource}
            />
            {changeType === 'minor' && (
              <Text size="body-sm" color="gray">
                Only punctuation, case or whitespace changed, so the
                translations can usually be copied as-is.
              </Text>
            )}
          </div>

          <div className="PortTranslationsModal__section">
            <div className="PortTranslationsModal__label">Transforms</div>
            <Checkbox
              size="xs"
              label="Apply the source changes to translations where the changed text appears unchanged (e.g. numbers, years, URLs and product names)"
              checked={carryOver}
              onChange={(e: Event) =>
                setCarryOver((e.target as HTMLInputElement).checked)
              }
            />
            {carryOver && sourceChanges.length > 0 && (
              <ul className="PortTranslationsModal__changes">
                {sourceChanges.map((change, i) => (
                  <li key={i} className="PortTranslationsModal__changes__item">
                    <code>{change.oldText || '∅'}</code>
                    {' → '}
                    <code>{change.newText || '∅'}</code>
                    <span className="PortTranslationsModal__changes__count">
                      {change.oldText.trim()
                        ? `applied in ${change.appliedCount} of ${change.total} languages`
                        : 'added text, edit manually'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="PortTranslationsModal__rules">
              {rules.map((rule, i) => (
                <div key={i} className="PortTranslationsModal__rule">
                  <TextInput
                    size="xs"
                    placeholder={rule.regex ? 'Find (regex)' : 'Find'}
                    value={rule.find}
                    error={ruleErrors[i]}
                    onChange={(e: Event) =>
                      updateRule(i, {
                        find: (e.target as HTMLInputElement).value,
                      })
                    }
                  />
                  <TextInput
                    size="xs"
                    placeholder={
                      rule.regex ? 'Replace ($1 for groups)' : 'Replace'
                    }
                    value={rule.replace}
                    onChange={(e: Event) =>
                      updateRule(i, {
                        replace: (e.target as HTMLInputElement).value,
                      })
                    }
                  />
                  <Checkbox
                    size="xs"
                    label="Regex"
                    checked={Boolean(rule.regex)}
                    onChange={(e: Event) =>
                      updateRule(i, {
                        regex: (e.target as HTMLInputElement).checked,
                      })
                    }
                  />
                  <Checkbox
                    size="xs"
                    label="Match case"
                    checked={Boolean(rule.caseSensitive)}
                    onChange={(e: Event) =>
                      updateRule(i, {
                        caseSensitive: (e.target as HTMLInputElement).checked,
                      })
                    }
                  />
                  <Tooltip label="Remove rule" position="top" withArrow>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={() =>
                        setRules((current) => current.filter((_, j) => j !== i))
                      }
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </div>
              ))}
              <div>
                <Button
                  variant="default"
                  size="xs"
                  leftIcon={<IconPlus size={14} />}
                  onClick={() =>
                    setRules((current) => [...current, {find: '', replace: ''}])
                  }
                >
                  Add find/replace rule
                </Button>
              </div>
            </div>
          </div>

          <div className="PortTranslationsModal__section">
            <div className="PortTranslationsModal__label">Translations</div>
            <table className="PortTranslationsModal__table">
              <thead>
                <tr>
                  <th />
                  <th>language</th>
                  <th>from</th>
                  <th>ported</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.lang}
                    className={joinClassNames(
                      !row.from && 'PortTranslationsModal__table__row--empty'
                    )}
                  >
                    <td className="PortTranslationsModal__table__checkbox">
                      <Checkbox
                        size="xs"
                        aria-label={`Port ${row.lang}`}
                        disabled={!row.from}
                        checked={selectedLangs.has(row.lang)}
                        onChange={(e: Event) =>
                          toggleLang(
                            row.lang,
                            (e.target as HTMLInputElement).checked
                          )
                        }
                      />
                    </td>
                    <td className="PortTranslationsModal__table__lang">
                      {row.lang}
                    </td>
                    <td className="PortTranslationsModal__table__from">
                      {row.from || (
                        <span className="PortTranslationsModal__table__none">
                          no translation
                        </span>
                      )}
                    </td>
                    <td className="PortTranslationsModal__table__value">
                      {row.from && (
                        <>
                          <Textarea
                            size="xs"
                            autosize
                            minRows={1}
                            value={row.value}
                            onChange={(e: Event) => {
                              const value = (e.target as HTMLTextAreaElement)
                                .value;
                              setOverrides((current) => ({
                                ...current,
                                [row.lang]: value,
                              }));
                            }}
                          />
                          <div className="PortTranslationsModal__table__badges">
                            {row.modified && (
                              <Badge size="xs" color="blue" variant="outline">
                                modified
                              </Badge>
                            )}
                            {row.existing && (
                              <Tooltip
                                label={`Current: ${row.existing}`}
                                position="top"
                                withArrow
                                wrapLines
                                width={300}
                              >
                                <Badge
                                  size="xs"
                                  color="orange"
                                  variant="outline"
                                >
                                  replaces existing
                                </Badge>
                              </Tooltip>
                            )}
                            {(row.placeholders.missing.length > 0 ||
                              row.placeholders.extra.length > 0) && (
                              <Tooltip
                                label={formatPlaceholderWarning(
                                  row.placeholders
                                )}
                                position="top"
                                withArrow
                                wrapLines
                                width={300}
                              >
                                <Badge
                                  size="xs"
                                  color="red"
                                  variant="outline"
                                  leftSection={<IconAlertTriangle size={10} />}
                                >
                                  placeholders
                                </Badge>
                              </Tooltip>
                            )}
                            {row.overridden && (
                              <Tooltip
                                label="Discard manual edits"
                                position="top"
                                withArrow
                              >
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  onClick={() =>
                                    setOverrides((current) => {
                                      const next = {...current};
                                      delete next[row.lang];
                                      return next;
                                    })
                                  }
                                >
                                  <IconArrowBackUp size={12} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="PortTranslationsModal__actions">
        <Button
          variant="default"
          size="xs"
          onClick={() => context.closeModal(id)}
        >
          Cancel
        </Button>
        <Button
          variant="filled"
          size="xs"
          color="dark"
          leftIcon={<IconArrowsTransferDown size={14} />}
          loading={saving}
          disabled={rowsToSave.length === 0}
          onClick={() => onSave()}
        >
          Port {rowsToSave.length > 0 ? rowsToSave.length : ''} translation
          {rowsToSave.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}

PortTranslationsModal.id = MODAL_ID;

/** Renders a word-level diff between two source strings. */
function SourceDiff(props: {oldSource: string; newSource: string}) {
  const ops = useMemo(
    () => diffStrings(props.oldSource, props.newSource),
    [props.oldSource, props.newSource]
  );
  return (
    <div className="PortTranslationsModal__source PortTranslationsModal__diff">
      {ops.map((op, i) => {
        if (op.type === 'delete') {
          return <del key={i}>{op.text}</del>;
        }
        if (op.type === 'insert') {
          return <ins key={i}>{op.text}</ins>;
        }
        return <span key={i}>{op.text}</span>;
      })}
    </div>
  );
}

function formatPlaceholderWarning(placeholders: {
  missing: string[];
  extra: string[];
}) {
  const parts: string[] = [];
  if (placeholders.missing.length > 0) {
    parts.push(`Missing: ${placeholders.missing.join(', ')}.`);
  }
  if (placeholders.extra.length > 0) {
    parts.push(`Not in source: ${placeholders.extra.join(', ')}.`);
  }
  return parts.join(' ');
}

function truncate(str: string, maxLength: number) {
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
}
