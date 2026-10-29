import {IconScissors} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {batchUpdateTags, loadTranslations, sourceHash} from '../../l10n.js';

const MODAL_ID = 'PruneTranslationsModal';

export interface PruneTranslationsModalProps {
  [key: string]: unknown;
  docId: string;
  sourceStrings: string[];
  /** Called after pruning completes with the hashes that were removed. */
  onPruned?: (prunedHashes: string[]) => void;
}

/** Hook that returns an `open()` function for launching the prune modal. */
export function usePruneTranslationsModal() {
  const modals = useModals();
  return {
    open: (innerProps: PruneTranslationsModalProps) => {
      modals.openContextModal(MODAL_ID, {
        title: `Prune unused strings from ${innerProps.docId}`,
        innerProps,
        size: 600,
      });
    },
  };
}

interface UnusedEntry {
  hash: string;
  source: string;
  tags: string[];
}

export function PruneTranslationsModal(
  modalProps: ContextModalProps<PruneTranslationsModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [loading, setLoading] = useState(true);
  const [unusedEntries, setUnusedEntries] = useState<UnusedEntry[]>([]);
  const [pruning, setPruning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function findUnused() {
      const docTag = props.docId;
      const taggedTranslations = await loadTranslations({tags: [docTag]});
      const currentHashes = new Set(
        await Promise.all(props.sourceStrings.map((s) => sourceHash(s)))
      );
      const entries: UnusedEntry[] = [];
      for (const [hash, translation] of Object.entries(taggedTranslations)) {
        if (!currentHashes.has(hash)) {
          const existingTags: string[] = (translation.tags as string[]) || [];
          if (existingTags.includes(docTag)) {
            entries.push({
              hash,
              source: translation.source || hash,
              tags: existingTags.filter((t) => t !== docTag),
            });
          }
        }
      }
      if (!cancelled) {
        setUnusedEntries(entries);
        setLoading(false);
      }
    }
    findUnused().catch((err) => {
      console.error(err);
      if (!cancelled) {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.docId, props.sourceStrings]);

  async function onConfirm() {
    if (unusedEntries.length === 0) return;
    setPruning(true);
    try {
      const updates = unusedEntries.map(({hash, tags}) => ({hash, tags}));
      await batchUpdateTags(updates, {mode: 'replace'});
      const prunedHashes = unusedEntries.map((e) => e.hash);
      showNotification({
        title: 'Pruned translations',
        message: `Removed "${props.docId}" tag from ${prunedHashes.length} unused translation(s).`,
        color: 'green',
        autoClose: 5000,
      });
      props.onPruned?.(prunedHashes);
      context.closeModal(id);
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Error pruning translations',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setPruning(false);
    }
  }

  return (
    <div className="PruneTranslationsModal flex flex-col gap-4">
      <div className="PruneTranslationsModal__description">
        <Text size="body">
          Pruning removes the <strong>{props.docId}</strong> tag from
          translation strings that are no longer referenced by this document.
          The translations themselves are not deleted and will remain available
          to other documents that still reference them.
        </Text>
      </div>

      {loading && (
        <div className="PruneTranslationsModal__loading flex items-center gap-2 py-4 text-muted">
          <Spinner label={null} />
          <Text size="body" color="gray">
            Scanning for unused strings…
          </Text>
        </div>
      )}

      {!loading && unusedEntries.length === 0 && (
        <div className="PruneTranslationsModal__empty py-4">
          <Text size="body" color="gray">
            All translations tagged with "{props.docId}" are still in use.
            Nothing to prune.
          </Text>
        </div>
      )}

      {!loading && unusedEntries.length > 0 && (
        <>
          <Text size="body" weight="semi-bold">
            {unusedEntries.length} unused string
            {unusedEntries.length !== 1 ? 's' : ''} will be untagged:
          </Text>
          <div className="PruneTranslationsModal__list max-h-60 overflow-y-auto rounded-sm border border-solid border-border">
            {unusedEntries.map((entry) => (
              <div
                key={entry.hash}
                className="PruneTranslationsModal__listItem break-words border-0 border-b border-solid border-border px-2.5 py-1.5 font-mono text-sm last:border-b-0"
              >
                <Text size="body-sm">{entry.source}</Text>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="PruneTranslationsModal__actions flex justify-end gap-2 pt-2">
        <Button variant="default" onClick={() => context.closeModal(id)}>
          Cancel
        </Button>
        <Button
          variant="danger"
          icon={<IconScissors />}
          loading={pruning}
          disabled={loading || unusedEntries.length === 0}
          onClick={onConfirm}
        >
          Prune {unusedEntries.length > 0 ? unusedEntries.length : ''} string
          {unusedEntries.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}

PruneTranslationsModal.id = MODAL_ID;
