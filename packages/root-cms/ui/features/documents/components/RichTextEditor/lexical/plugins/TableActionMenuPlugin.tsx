import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableCellNodeFromLexicalNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableRowNode,
  $isTableSelection,
  TableCellHeaderStates,
  TableCellNode,
  TableRowNode,
} from '@lexical/table';
import {IconDotsVertical} from '@tabler/icons-preact';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {createPortal} from 'preact/compat';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {
  Menu,
  MenuDivider,
  MenuItem,
} from '../../../../../../primitives/Menu/Menu.js';

interface TableActionMenuPluginProps {
  editor: LexicalEditor;
}

export function TableActionMenuPlugin(props: TableActionMenuPluginProps) {
  const {editor} = props;
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [tableCellNode, setTableCellNode] = useState<TableCellNode | null>(
    null
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRowHeader, setIsRowHeader] = useState(false);
  const [isColumnHeader, setIsColumnHeader] = useState(false);

  // Function to check and update header states
  const updateHeaderStates = useCallback(() => {
    if (!tableCellNode) {
      setIsRowHeader(false);
      setIsColumnHeader(false);
      return;
    }

    editor.getEditorState().read(
      () => {
        try {
          const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
          const rows = tableNode.getChildren();

          // Check if entire row is header
          let targetRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            const rowNode = rows[i];
            if (!$isTableRowNode(rowNode)) continue;
            const cells = (rowNode as TableRowNode).getChildren();
            if (
              cells.some(
                (cell: any) => cell.getKey() === tableCellNode.getKey()
              )
            ) {
              targetRowIndex = i;
              break;
            }
          }

          if (targetRowIndex !== -1) {
            const targetRow = rows[targetRowIndex];
            if ($isTableRowNode(targetRow)) {
              const cellsInRow = (targetRow as TableRowNode).getChildren();
              const firstCell = cellsInRow[0];
              if ($isTableCellNode(firstCell)) {
                const headerState = firstCell.getHeaderStyles();
                setIsRowHeader(
                  (headerState & TableCellHeaderStates.ROW) ===
                    TableCellHeaderStates.ROW
                );
              }
            }
          }

          // Check if entire column is header
          let targetColIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            const rowNode = rows[i];
            if (!$isTableRowNode(rowNode)) continue;
            const cells = (rowNode as TableRowNode).getChildren();
            for (let j = 0; j < cells.length; j++) {
              const cell: any = cells[j];
              if (cell.getKey() === tableCellNode.getKey()) {
                targetColIndex = j;
                break;
              }
            }
            if (targetColIndex !== -1) break;
          }

          if (targetColIndex !== -1) {
            const firstRow = rows[0];
            if ($isTableRowNode(firstRow)) {
              const firstRowCells = (firstRow as TableRowNode).getChildren();
              const firstCell = firstRowCells[targetColIndex];
              if ($isTableCellNode(firstCell)) {
                const headerState = firstCell.getHeaderStyles();
                setIsColumnHeader(
                  (headerState & TableCellHeaderStates.COLUMN) ===
                    TableCellHeaderStates.COLUMN
                );
              }
            }
          }
        } catch {
          // Handle case where table node is no longer valid
          setIsRowHeader(false);
          setIsColumnHeader(false);
        }
      },
      {editor}
    );
  }, [editor, tableCellNode]);

  // Update header states when menu opens or cell changes
  useEffect(() => {
    if (tableCellNode && isMenuOpen) {
      updateHeaderStates();
    }
  }, [tableCellNode, isMenuOpen, updateHeaderStates]);

  // Listen to editor updates to refresh header states
  useEffect(() => {
    if (!tableCellNode || !isMenuOpen) {
      return;
    }

    return editor.registerUpdateListener(() => {
      updateHeaderStates();
    });
  }, [editor, tableCellNode, isMenuOpen, updateHeaderStates]);

  const moveMenuButton = useCallback(() => {
    const menuButton = menuButtonRef.current;
    if (!menuButton || !tableCellNode) {
      return;
    }

    const tableCellNodeElement = editor.getElementByKey(tableCellNode.getKey());
    if (!tableCellNodeElement) {
      return;
    }

    const tableCellRect = tableCellNodeElement.getBoundingClientRect();

    // Position the menu button in the top-right corner of the cell, using
    // fixed positioning. The menu positions itself next to the button.
    menuButton.style.left = `${tableCellRect.right - 25}px`;
    menuButton.style.top = `${tableCellRect.top + 5}px`;
    menuButton.style.display = 'flex';
  }, [editor, tableCellNode]);

  useEffect(() => {
    if (!tableCellNode) {
      if (menuButtonRef.current) {
        menuButtonRef.current.style.display = 'none';
      }
      setIsMenuOpen(false);
      return;
    }

    moveMenuButton();

    // Update the button's position on scroll. The menu handles Escape and
    // clicks outside itself.
    const handleScroll = () => {
      moveMenuButton();
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [tableCellNode, moveMenuButton]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const node = selection.anchor.getNode();
          const cellNode = $getTableCellNodeFromLexicalNode(node);
          if ($isTableCellNode(cellNode)) {
            // Close menu if switching to a different cell
            const isDifferentCell =
              tableCellNode && cellNode.getKey() !== tableCellNode.getKey();
            if (isDifferentCell) {
              setIsMenuOpen(false);
            }
            setTableCellNode(cellNode);
          } else {
            setTableCellNode(null);
          }
        } else if ($isTableSelection(selection)) {
          const nodes = selection.getNodes();
          if (nodes.length > 0) {
            const cellNode = $getTableCellNodeFromLexicalNode(nodes[0]);
            if ($isTableCellNode(cellNode)) {
              // Close menu if switching to a different cell
              const isDifferentCell =
                tableCellNode && cellNode.getKey() !== tableCellNode.getKey();
              if (isDifferentCell) {
                setIsMenuOpen(false);
              }
              setTableCellNode(cellNode);
            }
          }
        } else {
          setTableCellNode(null);
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, tableCellNode]);

  const insertRowAbove = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      $insertTableRowAtSelection(false); // false = insert before
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const insertRowBelow = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      $insertTableRowAtSelection(true); // true = insert after
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const insertColumnLeft = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      $insertTableColumnAtSelection(false); // false = insert before
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const insertColumnRight = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      $insertTableColumnAtSelection(true); // true = insert after
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const deleteColumn = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      $deleteTableColumnAtSelection();
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const deleteRow = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      $deleteTableRowAtSelection();
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const deleteTable = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
      tableNode.remove();
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const toggleRowHeader = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
      const rows = tableNode.getChildren();

      // Find which row contains this cell
      let targetRowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        const rowNode = rows[i];
        if (!$isTableRowNode(rowNode)) continue;
        const cells = (rowNode as TableRowNode).getChildren();
        if (
          cells.some((cell: any) => cell.getKey() === tableCellNode.getKey())
        ) {
          targetRowIndex = i;
          break;
        }
      }

      if (targetRowIndex === -1) return;

      // Check current state of first cell in row to determine toggle direction
      const targetRow = rows[targetRowIndex];
      if (!$isTableRowNode(targetRow)) return;
      const cellsInRow = (targetRow as TableRowNode).getChildren();
      const firstCell = cellsInRow[0];
      const currentState = $isTableCellNode(firstCell)
        ? firstCell.getHeaderStyles()
        : 0;
      const isCurrentlyRowHeader =
        (currentState & TableCellHeaderStates.ROW) ===
        TableCellHeaderStates.ROW;

      // Apply to all cells in the row
      cellsInRow.forEach((cell: any) => {
        if ($isTableCellNode(cell)) {
          const headerState = cell.getHeaderStyles();
          const newHeaderState = isCurrentlyRowHeader
            ? headerState ^ TableCellHeaderStates.ROW
            : headerState | TableCellHeaderStates.ROW;
          cell.setHeaderStyles(newHeaderState, TableCellHeaderStates.ROW);
        }
      });
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  const toggleColumnHeader = useCallback(() => {
    editor.update(() => {
      if (!tableCellNode) return;
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
      const rows = tableNode.getChildren();

      // Find which column contains this cell
      let targetColIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        const rowNode = rows[i];
        if (!$isTableRowNode(rowNode)) continue;
        const cells = (rowNode as TableRowNode).getChildren();
        for (let j = 0; j < cells.length; j++) {
          const cell: any = cells[j];
          if (cell.getKey() === tableCellNode.getKey()) {
            targetColIndex = j;
            break;
          }
        }
        if (targetColIndex !== -1) break;
      }

      if (targetColIndex === -1) return;

      // Check current state of first cell in column to determine toggle direction
      const firstRow = rows[0];
      if (!$isTableRowNode(firstRow)) return;
      const firstRowCells = (firstRow as TableRowNode).getChildren();
      const firstCell = firstRowCells[targetColIndex];
      const currentState = $isTableCellNode(firstCell)
        ? firstCell.getHeaderStyles()
        : 0;
      const isCurrentlyColumnHeader =
        (currentState & TableCellHeaderStates.COLUMN) ===
        TableCellHeaderStates.COLUMN;

      // Apply to all cells in the column
      rows.forEach((rowNode: any) => {
        if (!$isTableRowNode(rowNode)) return;
        const cells = (rowNode as TableRowNode).getChildren();
        const cell = cells[targetColIndex];
        if ($isTableCellNode(cell)) {
          const headerState = cell.getHeaderStyles();
          const newHeaderState = isCurrentlyColumnHeader
            ? headerState ^ TableCellHeaderStates.COLUMN
            : headerState | TableCellHeaderStates.COLUMN;
          cell.setHeaderStyles(newHeaderState, TableCellHeaderStates.COLUMN);
        }
      });
    });
    setIsMenuOpen(false);
  }, [editor, tableCellNode]);

  if (!tableCellNode) {
    return null;
  }

  const editorRootElement = editor.getRootElement();
  if (!editorRootElement) {
    return null;
  }

  return createPortal(
    <Menu
      placement="bottom-end"
      label="Table actions"
      open={isMenuOpen}
      onOpenChange={(open, reason) => {
        setIsMenuOpen(open);
        // Give the editor focus back after an action, not the menu button.
        if (!open && reason === 'select') {
          editor.focus();
        }
      }}
      returnFocusOnSelect={false}
      className="LexicalEditor__tableActionMenu"
      trigger={
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Table actions"
          className="LexicalEditor__tableActionMenuButton fixed z-10 hidden size-5 cursor-pointer appearance-none items-center justify-center rounded-sm border border-solid border-border bg-chip p-0 text-fg transition-colors hover:bg-surface-active focus-visible:outline-2 focus-visible:outline-focus *:size-3.5"
        >
          <IconDotsVertical />
        </button>
      }
    >
      <MenuItem onClick={insertRowAbove}>Insert row above</MenuItem>
      <MenuItem onClick={insertRowBelow}>Insert row below</MenuItem>
      <MenuDivider />
      <MenuItem onClick={insertColumnLeft}>Insert column left</MenuItem>
      <MenuItem onClick={insertColumnRight}>Insert column right</MenuItem>
      <MenuDivider />
      <MenuItem onClick={deleteColumn}>Delete column</MenuItem>
      <MenuItem onClick={deleteRow}>Delete row</MenuItem>
      <MenuItem onClick={deleteTable}>Delete table</MenuItem>
      <MenuDivider />
      <MenuItem onClick={toggleRowHeader}>
        {isRowHeader ? 'Remove row header' : 'Convert to row header'}
      </MenuItem>
      <MenuItem onClick={toggleColumnHeader}>
        {isColumnHeader ? 'Remove column header' : 'Convert to column header'}
      </MenuItem>
    </Menu>,
    editorRootElement.parentElement || document.body
  );
}
