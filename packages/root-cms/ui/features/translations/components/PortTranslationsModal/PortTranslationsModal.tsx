import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowsTransferDown,
  IconPlus,
  IconRobot,
  IconSearch,
  IconTrash,
} from '@tabler/icons-preact';
import {useEffect, useId, useMemo, useState} from 'preact/hooks';
import {
  ReplaceRule,
  applyReplaceRule,
  classifySourceChange,
  diffStrings,
  findPlaceholderMismatches,
  portTranslation,
  rankBySimilarity,
} from '../../../../../shared/translation-port.js';
import {Text} from '../../../../components/Text/Text.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {DialogFooter} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {logAction} from '../../../logs/actions.js';
import {getTranslationForLanguage, getTranslationLanguage} from '../../l10n.js';

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
  /**
   * The translation languages to port. The source language (the default
   * locale) is excluded, since the source string is its "translation".
   */
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
  return {
    open: (innerProps: PortTranslationsModalProps) => {
      modals.openContextModal(MODAL_ID, {
        title: 'Port translations',
        innerProps,
        size: 'clamp(70%, 880px, 1040px)',
      });
    },
  };
}

/**
 * Modal for porting the translations of one source string to another, e.g.
 * after a source string is edited slightly. Translations can optionally be
 * transformed by find/replace rules or by an AI prompt.
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
  const [rules, setRules] = useState<ReplaceRule[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTransforming, setAiTransforming] = useState(false);
  /** AI-transformed translations, keyed by language. */
  const [aiResults, setAiResults] = useState<Record<string, string>>({});
  /** Prompts that produced the current `aiResults`, for logging. */
  const [aiPrompts, setAiPrompts] = useState<string[]>([]);
  const aiEnabled = testAiEnabled();
  const portFromLabelId = useId();
  const languages = useMemo(() => {
    const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
    const sourceLang = getTranslationLanguage(i18nConfig.defaultLocale || 'en');
    return props.languages.filter((lang) => lang !== sourceLang);
  }, [props.languages]);

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
            languages.some((lang) =>
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
    setAiResults({});
    setAiPrompts([]);
    const candidate = candidatesList.find((c) => c.source === source);
    const langs = new Set<string>();
    if (candidate) {
      languages.forEach((lang) => {
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
    return languages.map((lang) => {
      const from = getTranslationForLanguage(
        selectedCandidate.translations,
        lang
      );
      const existing = getTranslationForLanguage(
        props.targetTranslations,
        lang
      );
      const result = portTranslation({translation: from, rules: validRules});
      const overridden = lang in overrides;
      const aiTransformed = !overridden && lang in aiResults;
      let value = result.text;
      if (overridden) {
        value = overrides[lang];
      } else if (aiTransformed) {
        value = aiResults[lang];
      }
      return {
        lang,
        from,
        existing,
        value,
        overridden,
        aiTransformed,
        modified: Boolean(from) && value !== from,
        placeholders: value
          ? findPlaceholderMismatches(props.targetSource, value)
          : {missing: [], extra: []},
      };
    });
  }, [
    selectedCandidate,
    languages,
    props.targetSource,
    props.targetTranslations,
    validRules,
    overrides,
    aiResults,
  ]);

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

  /**
   * Transforms the current ported translations (after find/replace rules and
   * manual edits) using the AI prompt.
   */
  async function aiTransform() {
    const prompt = aiPrompt.trim();
    if (!selectedCandidate || !prompt) {
      return;
    }
    const translations: Record<string, string> = {};
    rows.forEach((row) => {
      if (row.from && row.value.trim()) {
        translations[row.lang] = row.value;
      }
    });
    if (Object.keys(translations).length === 0) {
      return;
    }
    setAiTransforming(true);
    try {
      const res = await window.fetch('/cms/api/ai.transform_translations', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          prompt,
          translations,
          oldSource: selectedCandidate.source,
          newSource: props.targetSource,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status !== 200 || !data?.success) {
        throw new Error(data?.error || `Request failed: ${res.status}`);
      }
      const transformed: Record<string, string> = data.translations || {};
      const langs = Object.keys(transformed);
      if (langs.length === 0) {
        throw new Error('The AI did not return any translations.');
      }
      setAiResults((current) => ({...current, ...transformed}));
      // The transform was applied on top of any manual edits, so the edits
      // are now part of the AI result.
      setOverrides((current) => {
        const next = {...current};
        langs.forEach((lang) => delete next[lang]);
        return next;
      });
      setAiPrompts((current) => [...current, prompt]);
      showNotification({
        title: 'Transformed translations',
        message: `Transformed ${langs.length} translation(s). Review the changes below.`,
        color: 'green',
        autoClose: 5000,
      });
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'AI transform failed',
        message: String((err as Error)?.message || err),
        color: 'red',
      });
    } finally {
      setAiTransforming(false);
    }
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
          rules: validRules,
          aiPrompts: aiPrompts.length > 0 ? aiPrompts : undefined,
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
    <div className="PortTranslationsModal flex flex-col gap-4">
      <Text size="body-sm" color="gray">
        Copy the translations of an existing source string to this string, e.g.
        after the source string was edited slightly. Review the ported
        translations below before saving.
      </Text>

      <div className="PortTranslationsModal__section flex flex-col gap-2">
        <div className="PortTranslationsModal__label text-sm font-semibold">
          Port to
        </div>
        <div className={SOURCE_CLASSES}>{props.targetSource}</div>
      </div>

      <div className="PortTranslationsModal__section flex flex-col gap-2">
        <div
          id={portFromLabelId}
          className="PortTranslationsModal__label text-sm font-semibold"
        >
          Port from
        </div>
        {loading ? (
          <div className="PortTranslationsModal__loading flex items-center py-2 text-muted">
            <Spinner />
          </div>
        ) : (
          <>
            <Select
              aria-labelledby={portFromLabelId}
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
              onValueChange={(value) => selectSource(value)}
            />
            <div className="PortTranslationsModal__lookup flex items-center gap-2">
              <TextInput
                className="PortTranslationsModal__lookupInput min-w-0 flex-1"
                aria-label="Old source string"
                placeholder="Or paste the exact old source string to look it up"
                value={lookupValue}
                onInput={(e) => setLookupValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    lookup();
                  }
                }}
              />
              <Button
                icon={<IconSearch />}
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
          <div className="PortTranslationsModal__section flex flex-col gap-2">
            <div className="PortTranslationsModal__label text-sm font-semibold">
              Source changes
            </div>
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

          <div className="PortTranslationsModal__section flex flex-col gap-2">
            <div className="PortTranslationsModal__label text-sm font-semibold">
              Find and replace
            </div>
            <Text size="body-sm" color="gray">
              Optionally update the ported translations, e.g. to replace a year
              or product name that changed in the source string.
            </Text>
            <div className="PortTranslationsModal__rules flex flex-col gap-2">
              {rules.map((rule, i) => (
                <div
                  key={i}
                  className="PortTranslationsModal__rule flex flex-wrap items-start gap-2"
                >
                  <TextInput
                    className="PortTranslationsModal__ruleFind min-w-40 flex-1"
                    aria-label="Find"
                    placeholder={rule.regex ? 'Find (regex)' : 'Find'}
                    value={rule.find}
                    error={ruleErrors[i]}
                    onInput={(e) =>
                      updateRule(i, {find: e.currentTarget.value})
                    }
                  />
                  <TextInput
                    className="PortTranslationsModal__ruleReplace min-w-40 flex-1"
                    aria-label="Replace"
                    placeholder={
                      rule.regex ? 'Replace ($1 for groups)' : 'Replace'
                    }
                    value={rule.replace}
                    onInput={(e) =>
                      updateRule(i, {replace: e.currentTarget.value})
                    }
                  />
                  <div className="PortTranslationsModal__ruleOptions flex h-control-sm items-center gap-3">
                    <Checkbox
                      label="Regex"
                      checked={Boolean(rule.regex)}
                      onChange={(e) =>
                        updateRule(i, {regex: e.currentTarget.checked})
                      }
                    />
                    <Checkbox
                      label="Match case"
                      checked={Boolean(rule.caseSensitive)}
                      onChange={(e) =>
                        updateRule(i, {caseSensitive: e.currentTarget.checked})
                      }
                    />
                    <IconButton
                      className="PortTranslationsModal__ruleRemove"
                      label="Remove rule"
                      variant="default"
                      size="xs"
                      onClick={() =>
                        setRules((current) => current.filter((_, j) => j !== i))
                      }
                    >
                      <IconTrash />
                    </IconButton>
                  </div>
                </div>
              ))}
              <div>
                <Button
                  icon={<IconPlus />}
                  onClick={() =>
                    setRules((current) => [...current, {find: '', replace: ''}])
                  }
                >
                  Add find/replace rule
                </Button>
              </div>
            </div>
          </div>

          {aiEnabled && (
            <div className="PortTranslationsModal__section flex flex-col gap-2">
              <div className="PortTranslationsModal__label text-sm font-semibold">
                Transform with AI
              </div>
              <Text size="body-sm" color="gray">
                Optionally describe how AI should update the ported
                translations, e.g. "Change the year to 2026" or "Use the
                informal tone".
              </Text>
              <div className="PortTranslationsModal__ai flex flex-wrap items-start gap-2">
                <Textarea
                  className="PortTranslationsModal__aiInput min-w-48 flex-1"
                  aria-label="AI transformation"
                  autosize
                  minRows={1}
                  maxRows={6}
                  placeholder="Describe the transformation"
                  value={aiPrompt}
                  disabled={aiTransforming}
                  onInput={(e) => setAiPrompt(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      aiTransform();
                    }
                  }}
                />
                <Button
                  icon={<IconRobot />}
                  loading={aiTransforming}
                  disabled={!aiPrompt.trim()}
                  onClick={() => aiTransform()}
                >
                  Transform
                </Button>
                {Object.keys(aiResults).length > 0 && (
                  <IconButton
                    label="Discard AI changes"
                    variant="default"
                    disabled={aiTransforming}
                    onClick={() => {
                      setAiResults({});
                      setAiPrompts([]);
                    }}
                  >
                    <IconArrowBackUp />
                  </IconButton>
                )}
              </div>
            </div>
          )}

          <div className="PortTranslationsModal__section flex flex-col gap-2">
            <div className="PortTranslationsModal__label text-sm font-semibold">
              Translations
            </div>
            <Table
              dense
              withColumnBorders
              label="Translations"
              tableClassName="PortTranslationsModal__table min-w-120"
            >
              <TableHead>
                <TableRow className="bg-surface-hover">
                  <TableHeaderCell className="w-px">
                    <span className="sr-only">Port</span>
                  </TableHeaderCell>
                  <TableHeaderCell className="w-px">lang</TableHeaderCell>
                  <TableHeaderCell>from</TableHeaderCell>
                  <TableHeaderCell>ported</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.lang}
                    className={cn(
                      !row.from &&
                        'PortTranslationsModal__tableRow--empty text-subtle'
                    )}
                  >
                    <TableCell className="PortTranslationsModal__tableCheckbox w-px align-top">
                      <Checkbox
                        aria-label={`Port ${row.lang}`}
                        disabled={!row.from}
                        checked={selectedLangs.has(row.lang)}
                        onChange={(e) =>
                          toggleLang(row.lang, e.currentTarget.checked)
                        }
                      />
                    </TableCell>
                    <TableCell className="PortTranslationsModal__tableLang w-px whitespace-nowrap align-top font-medium">
                      {row.lang}
                    </TableCell>
                    <TableCell className="PortTranslationsModal__tableFrom w-2/5 whitespace-pre-wrap break-words align-top">
                      {row.from || (
                        <span className="PortTranslationsModal__tableNone italic">
                          no translation
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="PortTranslationsModal__tableValue align-top">
                      {row.from && (
                        <>
                          <Textarea
                            aria-label={`Ported ${row.lang} translation`}
                            autosize
                            minRows={1}
                            value={row.value}
                            onInput={(e) => {
                              const value = e.currentTarget.value;
                              setOverrides((current) => ({
                                ...current,
                                [row.lang]: value,
                              }));
                            }}
                          />
                          <RowBadges
                            row={row}
                            onDiscard={() => {
                              const discard = (
                                current: Record<string, string>
                              ) => {
                                const next = {...current};
                                delete next[row.lang];
                                return next;
                              };
                              if (row.overridden) {
                                setOverrides(discard);
                              } else {
                                setAiResults(discard);
                              }
                            }}
                          />
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <DialogFooter>
        <Button onClick={() => context.closeModal(id)}>Cancel</Button>
        <Button
          variant="primary"
          icon={<IconArrowsTransferDown />}
          loading={saving}
          disabled={rowsToSave.length === 0}
          onClick={() => onSave()}
        >
          Port {rowsToSave.length > 0 ? rowsToSave.length : ''} translation
          {rowsToSave.length !== 1 ? 's' : ''}
        </Button>
      </DialogFooter>
    </div>
  );
}

PortTranslationsModal.id = MODAL_ID;

/** Classes for the boxes that show a source string. */
const SOURCE_CLASSES =
  'PortTranslationsModal__source whitespace-pre-wrap break-words rounded-sm border border-solid border-border bg-surface-hover px-3 py-2 text-base leading-normal';

/** The status badges (and discard button) under a ported translation. */
function RowBadges(props: {
  row: {
    existing: string;
    modified: boolean;
    overridden: boolean;
    aiTransformed: boolean;
    placeholders: {missing: string[]; extra: string[]};
  };
  onDiscard: () => void;
}) {
  const {row} = props;
  const hasPlaceholderWarning =
    row.placeholders.missing.length > 0 || row.placeholders.extra.length > 0;
  if (
    !row.modified &&
    !row.aiTransformed &&
    !row.existing &&
    !hasPlaceholderWarning &&
    !row.overridden
  ) {
    return null;
  }
  return (
    <div className="PortTranslationsModal__tableBadges mt-1 flex flex-wrap items-center gap-1">
      {row.modified && (
        <Badge size="xs" tone="info" variant="outline">
          modified
        </Badge>
      )}
      {row.aiTransformed && (
        <Badge size="xs" tone="violet" variant="outline" icon={<IconRobot />}>
          AI
        </Badge>
      )}
      {row.existing && (
        <Tooltip label={`Current: ${row.existing}`}>
          <Badge size="xs" tone="warning" variant="outline" tabIndex={0}>
            replaces existing
          </Badge>
        </Tooltip>
      )}
      {hasPlaceholderWarning && (
        <Tooltip label={formatPlaceholderWarning(row.placeholders)}>
          <Badge
            size="xs"
            tone="danger"
            variant="outline"
            icon={<IconAlertTriangle />}
            tabIndex={0}
          >
            placeholders
          </Badge>
        </Tooltip>
      )}
      {(row.overridden || row.aiTransformed) && (
        <IconButton
          size="xs"
          label={row.overridden ? 'Discard manual edits' : 'Discard AI changes'}
          onClick={props.onDiscard}
        >
          <IconArrowBackUp />
        </IconButton>
      )}
    </div>
  );
}

/** Renders a word-level diff between two source strings. */
function SourceDiff(props: {oldSource: string; newSource: string}) {
  const ops = useMemo(
    () => diffStrings(props.oldSource, props.newSource),
    [props.oldSource, props.newSource]
  );
  return (
    <div className={cn(SOURCE_CLASSES, 'PortTranslationsModal__diff')}>
      {ops.map((op, i) => {
        if (op.type === 'delete') {
          return (
            <del key={i} className="bg-danger-soft text-danger">
              {op.text}
            </del>
          );
        }
        if (op.type === 'insert') {
          return (
            <ins key={i} className="bg-success-soft text-success no-underline">
              {op.text}
            </ins>
          );
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
