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
import {ActionIcon, Button, Menu, MultiSelect, TextInput} from '@mantine/core';
import {
  IconCheck,
  IconDots,
  IconSearch,
  IconTag,
  IconWorld,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useArrayParam, useStringParam} from '../../hooks/useQueryParam.js';
import {joinClassNames} from '../../utils/classes.js';
import {loadTranslations} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';

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
  const allLocales = [
    'en',
    ...locales.filter((l: string) => l !== 'en').sort(),
  ];

  // URL State
  const [searchQuery, setSearchQuery] = useStringParam('q', '');
  const [selectedLocales, setSelectedLocales] = useArrayParam('locales', []);
  const [selectedTags, setSelectedTags] = useArrayParam('tags', []);
  const [showHashes, setShowHashes] = useState(false);

  // Derived state for available tags
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

    // Group tags
    const result: {value: string; label: string; group: string}[] = [];
    const tagsArray = Array.from(tags).sort();

    // First identify all implicit groups from tags with slashes
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
        // If the tag itself is a group name (e.g. "Common" when "Common/Button" exists)
        group = tag;
      }

      result.push({value: tag, label: tag, group});
    });

    return result;
  }, [translationsMap]);

  async function updateTranslationsMap() {
    await notifyErrors(async () => {
      const data = await loadTranslations();
      console.log('Loaded translations:', Object.keys(data).length);
      setTranslationsMap(data);
    });
  }

  useEffect(() => {
    updateTranslationsMap();
  }, []);

  useEffect(() => {
    const data: TableRowData[] = [];
    Object.entries(translationsMap).forEach(([hash, translations]) => {
      // Filter by tags if any are selected
      const rowTags = normalizeTags(translations.tags);
      if (selectedTags.length > 0) {
        const hasTag = selectedTags.some((tag: string) =>
          rowTags.includes(tag)
        );
        if (!hasTag) {
          return;
        }
      }

      // Filter by search query
      if (searchQuery) {
        const query = (searchQuery || '').toLowerCase();

        // Defensive checks for translations object
        if (!translations) {
          return;
        }

        const source = translations.source || '';
        const matchesSource = source.toLowerCase().includes(query);

        const hashStr = hash || '';
        const matchesHash = hashStr.toLowerCase().includes(query);

        const matchesTranslation = allLocales.some((locale) => {
          const translation = translations[locale];
          return (translation || '').toLowerCase().includes(query);
        });

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
        row[locale] = translations[locale] || '';
      });
      data.push(row);
    });
    setRowData(data);
  }, [translationsMap, searchQuery, selectedTags, selectedLocales]);

  // Determine which locales to show
  const visibleLocales =
    selectedLocales.length > 0 ? selectedLocales : allLocales;

  const columnDefs = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      {
        field: 'source',
        headerName: 'Source',
        headerClass: 'no-border-header',
        pinned: 'left',
        lockPinned: true,
        lockPosition: true,
        suppressMovable: true,
        width: 310,
        sortable: true,
        resizable: true,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (params: ICellRendererParams) => {
          return (
            <div
              style={{
                whiteSpace: 'normal',
                lineHeight: '1.5',
                padding: '8px 0',
                fontSize: '12px',
              }}
            >
              <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                <span>{params.value}</span>
              </div>
              {showHashes && (
                <div style={{fontSize: '0.8em', color: '#888', marginTop: 4}}>
                  <a
                    href={`/cms/translations/${params.data.hash}`}
                    target="_blank"
                    style={{textDecoration: 'none', color: 'inherit'}}
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
        width: 300,
        editable: false,
        resizable: true,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (params: ICellRendererParams) => {
          return (
            <div
              style={{
                whiteSpace: 'normal',
                lineHeight: '1.5',
                padding: '8px 0',
                fontSize: '12px',
              }}
            >
              {params.value}
            </div>
          );
        },
      });
    });

    // Actions column
    cols.push({
      headerName: 'Actions',
      field: 'actions',
      headerClass: 'no-border-header',
      pinned: 'right',
      lockPinned: true,
      lockPosition: true,
      suppressMovable: true,
      width: 90,
      sortable: false,
      cellRenderer: (params: ICellRendererParams) => {
        return (
          <Button
            component="a"
            href={`/cms/translations/${params.data.hash}`}
            target="_blank"
            size="xs"
            variant="outline"
            color="dark"
            compact
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
          className="ag-header-cell-label"
          role="presentation"
          style={{gap: 10}}
        >
          <IconTag size={18} />
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
      pinned: 'right',
      lockPinned: true,
      lockPosition: true,
      width: 150,
      sortable: false,
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '8px 0',
            }}
          >
            {params.value.map((tag: string) => (
              <div
                key={tag}
                style={{
                  fontSize: '12px',
                  lineHeight: '1.2',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                <span
                  title={tag}
                  style={{
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    display: 'block',
                  }}
                  onClick={() => {
                    if (selectedTags.includes(tag)) {
                      setSelectedTags(selectedTags.filter((t) => t !== tag));
                    } else {
                      setSelectedTags([...selectedTags, tag]);
                    }
                  }}
                >
                  {tag}
                </span>
              </div>
            ))}
          </div>
        );
      },
    });

    return cols;
  }, [visibleLocales, showHashes, selectedTags]);

  const gridOptions: GridOptions = {
    headerHeight: 40,
    animateRows: true,
    enableCellTextSelection: true, // Enable text selection
    suppressMovableColumns: true,
  };

  return (
    <div className="TranslationsTable">
      <style>{`
        .no-border-header .ag-header-cell-resize::after {
          display: none !important;
        }
        .no-border-header {
          border-right: none !important;
        }
      `}</style>
      <div style={{marginBottom: 16, display: 'flex', gap: 16}}>
        <TextInput
          placeholder="Search translations"
          icon={<IconSearch size={18} />}
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearchQuery(e.currentTarget.value)
          }
          style={{flex: 1}}
        />
        <MultiSelect
          data={allLocales}
          value={selectedLocales}
          onChange={setSelectedLocales}
          placeholder={
            selectedLocales.length === 0 ? 'All locales' : 'Filter locales'
          }
          searchable
          clearable
          icon={<IconWorld size={18} />}
          maxDropdownHeight={600}
          style={{width: 300}}
        />
        <MultiSelect
          data={availableTags}
          value={selectedTags}
          onChange={setSelectedTags}
          placeholder={selectedTags.length === 0 ? 'All tags' : 'Filter tags'}
          searchable
          clearable
          icon={<IconTag size={18} />}
          maxDropdownHeight={600}
          style={{width: 300}}
        />
        <Menu
          shadow="md"
          control={
            <ActionIcon variant="outline" size="lg" style={{height: 36}}>
              <IconDots size={18} />
            </ActionIcon>
          }
        >
          <Menu.Label>View Options</Menu.Label>
          <Menu.Item
            icon={showHashes ? <IconCheck size={14} /> : null}
            onClick={() => setShowHashes(!showHashes)}
          >
            Show Hashes
          </Menu.Item>
        </Menu>
      </div>
      <div
        className="ag-theme-alpine"
        style={{height: 'calc(100vh - 200px)', width: '100%', fontSize: '13px'}}
      >
        {/* @ts-expect-error - AgGridReact not compatible with Preact types. */}
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          gridOptions={gridOptions}
        />
      </div>
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
