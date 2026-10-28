import './TranslationsTable.css';

import {ClientSideRowModelModule} from '@ag-grid-community/client-side-row-model';
import {
  ColDef,
  GridOptions,
  ICellRendererParams,
  IHeaderParams,
  ModuleRegistry,
  ValueFormatterParams,
} from '@ag-grid-community/core';
import {AgGridReact} from '@ag-grid-community/react';
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-alpine.css';
import {
  IconCheck,
  IconDots,
  IconSearch,
  IconTag,
  IconTagMinus,
  IconTagPlus,
  IconWorld,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useMediaQuery} from '../../../../hooks/useMediaQuery.js';
import {
  useArrayParam,
  useStringParam,
} from '../../../../hooks/useQueryParam.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {
  Menu,
  MenuDivider,
  MenuGroup,
  MenuItem,
} from '../../../../primitives/Menu/Menu.js';
import {MultiSelect} from '../../../../primitives/MultiSelect/MultiSelect.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {joinClassNames} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {
  batchUpdateTags,
  getTranslationForLanguage,
  isLocaleExcludedFromTranslations,
  loadTranslations,
  toTranslationLanguages,
} from '../../l10n.js';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

interface TableRowData {
  hash: string;
  source: string;
  tags: string[];
  [locale: string]: string | string[];
}

export function TranslationsTable() {
  const [rowData, setRowData] = useState<TableRowData[]>([]);
  const [translationsMap, setTranslationsMap] = useState<
    Record<string, Record<string, string>>
  >({});

  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  // Columns are "translation languages", which may be shared by multiple
  // root locales (per the `i18n.translationLanguages` config).
  const allLocales = [
    'en',
    ...toTranslationLanguages(
      locales.filter(
        (l: string) => l !== 'en' && !isLocaleExcludedFromTranslations(l)
      )
    )
      .filter((lang: string) => lang !== 'en')
      .sort(),
  ];

  // URL State.
  const [searchQuery, setSearchQuery] = useStringParam('q', '');
  const [inputValue, setInputValue] = useState(searchQuery);
  const [selectedLocales, setSelectedLocales] = useArrayParam('locales', []);
  const [selectedTags, setSelectedTags] = useArrayParam('tags', []);
  const [showHashes, setShowHashes] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [exactMatchesOnly, setExactMatchesOnly] = useState(false);

  // Bulk Edit Tags Modal State
  const [isAddTagsModalOpen, setIsAddTagsModalOpen] = useState(false);
  const [isRemoveTagsModalOpen, setIsRemoveTagsModalOpen] = useState(false);
  const [tagsToBulkAdd, setTagsToBulkAdd] = useState<string[]>([]);
  const [tagsToBulkRemove, setTagsToBulkRemove] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const handleBulkAddTags = async () => {
    setIsBulkUpdating(true);
    try {
      const updates = rowData.map((row) => {
        const currentTags = row.tags || [];
        const newTags = Array.from(
          new Set([...currentTags, ...tagsToBulkAdd])
        ).sort();
        return {hash: row.hash, tags: newTags};
      });
      await batchUpdateTags(updates);
      await updateTranslationsMap();
      setIsAddTagsModalOpen(false);
      setTagsToBulkAdd([]);
    } catch (err) {
      console.error(err);
      notifyErrors(async () => {
        throw err;
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkRemoveTags = async () => {
    setIsBulkUpdating(true);
    try {
      const updates = rowData.map((row) => {
        const currentTags = row.tags || [];
        const newTags = currentTags.filter(
          (t) => !tagsToBulkRemove.includes(t)
        );
        return {hash: row.hash, tags: newTags};
      });
      await batchUpdateTags(updates);
      await updateTranslationsMap();
      setIsRemoveTagsModalOpen(false);
      setTagsToBulkRemove([]);
    } catch (err) {
      console.error(err);
      notifyErrors(async () => {
        throw err;
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Sync input value when URL param changes (e.g. back/forward navigation).
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  // Debounce search query updates.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== searchQuery) {
        setSearchQuery(inputValue);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue, searchQuery]);

  // Derived state for available tags.
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    Object.values(translationsMap).forEach((t) => {
      if (t.tags) {
        if (Array.isArray(t.tags)) {
          t.tags.forEach((tag) => tags.add(tag));
        } else {
          tags.add(t.tags as any);
        }
      }
    });

    // Group tags.
    const result: {value: string; label: string; group: string}[] = [];
    const tagsArray = Array.from(tags).sort();

    // First identify all implicit groups from tags with slashes.
    const groups = new Set<string>();
    tagsArray.forEach((tag) => {
      if (tag.includes('/')) {
        groups.add(tag.split('/')[0]);
      }
    });

    tagsArray.forEach((tag) => {
      let group = 'Other';
      if (tag.includes('/')) {
        group = tag.split('/')[0];
      } else if (groups.has(tag)) {
        // If the tag itself is a group name (e.g. "Common" when "Common/Button" exists).
        group = tag;
      }

      result.push({value: tag, label: tag, group});
    });

    return result;
  }, [translationsMap]);

  async function updateTranslationsMap() {
    setIsLoading(true);
    // NOTE: the loading state is cleared outside the notifyErrors() callback
    // so the spinner also clears when loadTranslations() fails.
    await notifyErrors(async () => {
      const data = await withTimeout(
        loadTranslations(),
        undefined,
        'loading translations'
      );
      console.log('Loaded translations:', Object.keys(data).length);
      setTranslationsMap(data);
    });
    setIsLoading(false);
  }

  useEffect(() => {
    updateTranslationsMap();
  }, []);

  useEffect(() => {
    const data: TableRowData[] = [];
    Object.entries(translationsMap).forEach(([hash, translations]) => {
      // Filter by tags if any are selected.
      const rowTags = normalizeTags(translations.tags);
      if (selectedTags.length > 0) {
        const hasTag = selectedTags.some((tag: string) =>
          rowTags.includes(tag)
        );
        if (!hasTag) {
          return;
        }
      }

      // Filter by search query.
      if (searchQuery) {
        const query = (searchQuery || '').toLowerCase();

        // Defensive checks for translations object.
        if (!translations) {
          return;
        }

        const source = translations.source || '';
        const hashStr = hash || '';

        let matchesSource: boolean;
        let matchesHash: boolean;
        let matchesTranslation: boolean;

        if (exactMatchesOnly) {
          matchesSource = source.toLowerCase() === query;
          matchesHash = hashStr.toLowerCase() === query;
          matchesTranslation = allLocales.some((locale) => {
            const translation = getTranslationForLanguage(translations, locale);
            return translation.toLowerCase() === query;
          });
        } else {
          matchesSource = source.toLowerCase().includes(query);
          matchesHash = hashStr.toLowerCase().includes(query);
          matchesTranslation = allLocales.some((locale) => {
            const translation = getTranslationForLanguage(translations, locale);
            return translation.toLowerCase().includes(query);
          });
        }

        if (!matchesSource && !matchesHash && !matchesTranslation) {
          return;
        }
      }

      const row: TableRowData = {
        hash,
        source: translations.source || '',
        tags: rowTags,
      };
      allLocales.forEach((locale) => {
        row[locale] = getTranslationForLanguage(translations, locale);
      });
      data.push(row);
    });
    setRowData(data);
  }, [
    translationsMap,
    searchQuery,
    selectedTags,
    selectedLocales,
    exactMatchesOnly,
  ]);

  // Determine which locales to show.
  const visibleLocales =
    selectedLocales.length > 0 ? selectedLocales : allLocales;

  // Pinned columns don't scroll, so they're only pinned when there's room
  // for the locale columns beside them.
  const isDesktop = useMediaQuery('(width >= 48rem)');

  const columnDefs = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      {
        field: 'source',
        headerName: 'Source',
        headerClass: 'no-border-header',
        pinned: isDesktop ? 'left' : null,
        lockPinned: true,
        lockPosition: true,
        suppressMovable: true,
        width: isDesktop ? 310 : 220,
        sortable: true,
        resizable: true,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (params: ICellRendererParams) => {
          return (
            <div className="TranslationsTable__cell whitespace-normal py-2 text-sm leading-normal">
              <div className="flex items-center gap-1">
                <span>{params.value}</span>
              </div>
              {showHashes && (
                <div className="TranslationsTable__hash mt-1 text-xs text-muted">
                  <a
                    className="text-inherit no-underline"
                    href={`/cms/translations/${params.data.hash}`}
                  >
                    {params.data.hash}
                  </a>
                </div>
              )}
            </div>
          );
        },
      },
    ];

    visibleLocales.forEach((locale: string) => {
      cols.push({
        field: locale,
        headerName: locale,
        width: isDesktop ? 300 : 220,
        editable: false,
        resizable: true,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (params: ICellRendererParams) => {
          return (
            <div className="TranslationsTable__cell whitespace-normal py-2 text-sm leading-normal">
              {params.value}
            </div>
          );
        },
      });
    });

    // Actions column.
    cols.push({
      headerName: 'Actions',
      field: 'actions',
      headerClass: 'no-border-header',
      pinned: isDesktop ? 'right' : null,
      lockPinned: true,
      lockPosition: true,
      suppressMovable: true,
      width: 90,
      sortable: false,
      cellRenderer: (params: ICellRendererParams) => {
        return (
          <Button
            className="TranslationsTable__edit"
            href={`/cms/translations/${params.data.hash}`}
            size="xs"
          >
            Edit
          </Button>
        );
      },
    });

    // Tags column.
    cols.push({
      field: 'tags',
      headerName: 'Tags',
      headerComponent: (props: IHeaderParams) => (
        <div
          className="ag-header-cell-label cursor-pointer gap-2.5"
          role="presentation"
          onClick={(e) => props.progressSort && props.progressSort(e.shiftKey)}
        >
          <IconTag size={16} />
          <span>{props.displayName}</span>
          {props.enableSorting && (
            <div className="ag-sort-indicator-container">
              <span
                className={joinClassNames(
                  'ag-sort-indicator-icon',
                  'ag-sort-ascending-icon',
                  props.column.getSort() !== 'asc' && 'ag-hidden'
                )}
                aria-hidden="true"
              >
                <span className="ag-icon ag-icon-asc" role="presentation" />
              </span>
              <span
                className={joinClassNames(
                  'ag-sort-indicator-icon',
                  'ag-sort-descending-icon',
                  props.column.getSort() !== 'desc' && 'ag-hidden'
                )}
                aria-hidden="true"
              >
                <span className="ag-icon ag-icon-desc" role="presentation" />
              </span>
            </div>
          )}
        </div>
      ),
      pinned: isDesktop ? 'right' : null,
      lockPinned: true,
      lockPosition: true,
      width: 150,
      sortable: true,
      autoHeight: true,
      valueFormatter: (params: ValueFormatterParams) =>
        Array.isArray(params.value) ? params.value.join(', ') : '',
      cellRenderer: (params: ICellRendererParams) => {
        if (
          !params.value ||
          !Array.isArray(params.value) ||
          params.value.length === 0
        ) {
          return null;
        }
        return (
          <div className="TranslationsTable__tags flex flex-col gap-0.5 py-2">
            {params.value.map((tag: string) => (
              <div
                key={tag}
                className="TranslationsTable__tag truncate text-sm leading-tight"
              >
                <button
                  type="button"
                  title={tag}
                  aria-pressed={selectedTags.includes(tag)}
                  className="TranslationsTable__tagButton m-0 block w-full max-w-full cursor-pointer appearance-none truncate border-0 bg-transparent p-0 text-left font-sans text-sm leading-tight text-inherit underline"
                  onClick={() => {
                    if (selectedTags.includes(tag)) {
                      setSelectedTags(selectedTags.filter((t) => t !== tag));
                    } else {
                      setSelectedTags([...selectedTags, tag]);
                    }
                  }}
                >
                  {tag}
                </button>
              </div>
            ))}
          </div>
        );
      },
    });

    return cols;
  }, [visibleLocales, showHashes, selectedTags, isDesktop]);

  const gridOptions: GridOptions = {
    headerHeight: 40,
    animateRows: true,
    enableCellTextSelection: true,
    suppressMovableColumns: true,
  };

  return (
    <div className="TranslationsTable">
      <div className="TranslationsTable__toolbar mb-4 flex flex-wrap gap-2 md:flex-nowrap md:gap-4">
        <TextInput
          className="TranslationsTable__search w-full md:w-auto md:flex-1"
          size="md"
          aria-label="Search translations"
          placeholder="Search translations"
          leftSection={<IconSearch />}
          value={inputValue}
          onInput={(e) => setInputValue(e.currentTarget.value)}
        />
        <MultiSelect
          className="TranslationsTable__locales min-w-0 flex-1 md:w-72 md:flex-none"
          size="md"
          aria-label="Filter locales"
          data={allLocales}
          value={selectedLocales}
          onValueChange={setSelectedLocales}
          placeholder={
            selectedLocales.length === 0 ? 'All locales' : 'Filter locales'
          }
          clearable
          leftSection={<IconWorld />}
          maxDropdownHeight={600}
        />
        <MultiSelect
          className="TranslationsTable__tagsFilter min-w-0 flex-1 md:w-72 md:flex-none"
          size="md"
          aria-label="Filter tags"
          data={availableTags}
          value={selectedTags}
          onValueChange={setSelectedTags}
          placeholder={selectedTags.length === 0 ? 'All tags' : 'Filter tags'}
          clearable
          leftSection={<IconTag />}
          maxDropdownHeight={600}
        />
        <Menu
          placement="bottom-end"
          trigger={
            <IconButton
              className="TranslationsTable__menuButton"
              label="Table options"
              variant="default"
              size="md"
            >
              <IconDots />
            </IconButton>
          }
        >
          <MenuGroup label="View Options">
            <MenuItem
              icon={showHashes ? <IconCheck /> : null}
              onClick={() => setShowHashes(!showHashes)}
            >
              Show Hashes
            </MenuItem>
            <MenuItem
              icon={exactMatchesOnly ? <IconCheck /> : null}
              onClick={() => setExactMatchesOnly(!exactMatchesOnly)}
            >
              Exact Matches Only
            </MenuItem>
          </MenuGroup>
          <MenuDivider />
          <MenuGroup label="Bulk Edit Tags">
            <MenuItem
              icon={<IconTagPlus />}
              onClick={() => setIsAddTagsModalOpen(true)}
            >
              Add tags...
            </MenuItem>
            <MenuItem
              icon={<IconTagMinus />}
              onClick={() => setIsRemoveTagsModalOpen(true)}
            >
              Remove tags...
            </MenuItem>
          </MenuGroup>
        </Menu>
      </div>
      {isLoading ? (
        <div className="TranslationsTable__loading TranslationsTable__viewport flex flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="TranslationsTable__grid TranslationsTable__viewport ag-theme-alpine w-full">
          {/* @ts-expect-error - AgGridReact not compatible with Preact types. */}
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
          />
        </div>
      )}
      <Dialog
        className="TranslationsTable__addTagsDialog"
        open={isAddTagsModalOpen}
        onClose={() => setIsAddTagsModalOpen(false)}
        title="Bulk Add Tags"
        footer={
          <>
            <Button onClick={() => setIsAddTagsModalOpen(false)}>Cancel</Button>
            <Button
              variant="blue"
              loading={isBulkUpdating}
              onClick={handleBulkAddTags}
            >
              Add Tags
            </Button>
          </>
        }
      >
        <p className="m-0 mb-4 text-sm">
          The following tags will be added to the {rowData.length} strings
          currently visible in the table.
        </p>
        <MultiSelect
          aria-label="Tags to add"
          data={availableTags}
          value={tagsToBulkAdd}
          onValueChange={setTagsToBulkAdd}
          placeholder="Select or create tags"
          creatable
          getCreateLabel={(query: string) => `+ Create ${query}`}
          onCreate={(query: string) => ({
            value: query,
            label: query,
            group: 'Other',
          })}
        />
      </Dialog>

      <Dialog
        className="TranslationsTable__removeTagsDialog"
        open={isRemoveTagsModalOpen}
        onClose={() => setIsRemoveTagsModalOpen(false)}
        title="Bulk Remove Tags"
        footer={
          <>
            <Button onClick={() => setIsRemoveTagsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={isBulkUpdating}
              onClick={handleBulkRemoveTags}
            >
              Remove Tags
            </Button>
          </>
        }
      >
        <p className="m-0 mb-4 text-sm">
          The following tags will be removed from the {rowData.length} strings
          currently visible in the table.
        </p>
        <MultiSelect
          aria-label="Tags to remove"
          data={availableTags}
          value={tagsToBulkRemove}
          onValueChange={setTagsToBulkRemove}
          placeholder="Select tags to remove"
        />
      </Dialog>
    </div>
  );
}

function normalizeTags(tags: string | string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return Array.from(new Set(tags)).sort();
  }
  return [tags];
}
