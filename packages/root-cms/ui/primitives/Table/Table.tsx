import type {ComponentChildren, JSX} from 'preact';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {type ClassNames, cn} from '../../utils/classes.js';

interface TableOptions {
  dense: boolean;
  striped: boolean;
  hover: boolean;
  stickyFirstColumn: boolean;
  withColumnBorders: boolean;
}

const TableContext = createContext<TableOptions>({
  dense: false,
  striped: false,
  hover: false,
  stickyFirstColumn: false,
  withColumnBorders: false,
});

/** Whether rows are in the `<thead>` or `<tbody>`. */
const SectionContext = createContext<'head' | 'body'>('body');

export interface TableProps extends JSX.HTMLAttributes<HTMLTableElement> {
  /** Tighter cell padding, for long lists of data. */
  dense?: boolean;
  /** Shades every other body row. */
  striped?: boolean;
  /** Highlights the body row under the pointer. */
  hover?: boolean;
  /**
   * Pins the first column while the table scrolls sideways, so each row
   * stays identifiable on narrow screens.
   */
  stickyFirstColumn?: boolean;
  /**
   * Draws a vertical divider between columns. Off by default, like
   * Mantine's: rows are divided, columns aren't.
   */
  withColumnBorders?: boolean;
  /**
   * Names the scrolling region for screen readers, e.g. "Assets". Useful
   * when there are several tables on a page.
   */
  label?: string;
  /** Classes for the bordered, scrolling wrapper (the root element). */
  className?: string;
  /** Classes for inner elements: `table` (the `<table>` itself). */
  classNames?: ClassNames<'table'>;
  children?: ComponentChildren;
}

/**
 * A bordered data table that scrolls sideways when it's wider than its
 * container, instead of widening the page. Compose it from `TableHead`,
 * `TableBody`, `TableRow`, `TableHeaderCell` and `TableCell`. Native table
 * props go to the `<table>`; `className` goes to the scrolling wrapper.
 * Replaces Mantine's `Table`.
 *
 * ```tsx
 * <Table dense hover stickyFirstColumn label="Assets">
 *   <TableHead>
 *     <TableRow>
 *       <TableHeaderCell>Name</TableHeaderCell>
 *       <TableHeaderCell>Size</TableHeaderCell>
 *     </TableRow>
 *   </TableHead>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>hero.jpg</TableCell>
 *       <TableCell>240 KB</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 */
export function Table(props: TableProps) {
  const {
    dense = false,
    striped = false,
    hover = false,
    stickyFirstColumn = false,
    withColumnBorders = false,
    label,
    className,
    classNames,
    children,
    ...rest
  } = props;

  return (
    <TableContext.Provider
      value={{dense, striped, hover, stickyFirstColumn, withColumnBorders}}
    >
      <div
        role={label ? 'region' : undefined}
        aria-label={label}
        // Focusable, so keyboard users can scroll it sideways.
        tabIndex={0}
        className={cn(
          'Table',
          dense && 'Table--dense',
          striped && 'Table--striped',
          hover && 'Table--hover',
          stickyFirstColumn && 'Table--stickyFirstColumn',
          withColumnBorders && 'Table--withColumnBorders',
          'w-full max-w-full overflow-x-auto rounded-md border border-solid border-border bg-surface',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          className
        )}
      >
        <table
          {...rest}
          className={cn(
            'Table__table',
            'w-full border-separate border-spacing-0 font-sans text-sm text-fg',
            classNames?.table
          )}
        >
          {children}
        </table>
      </div>
    </TableContext.Provider>
  );
}

type SectionProps = JSX.HTMLAttributes<HTMLTableSectionElement> & {
  className?: string;
  children?: ComponentChildren;
};

/** The `<thead>`. Its rows hold `TableHeaderCell`s. */
export function TableHead(props: SectionProps) {
  const {className, ...rest} = props;
  return (
    <SectionContext.Provider value="head">
      <thead {...rest} className={cn('Table__head', className)} />
    </SectionContext.Provider>
  );
}

/** The `<tbody>`. */
export function TableBody(props: SectionProps) {
  const {className, ...rest} = props;
  return (
    <SectionContext.Provider value="body">
      <tbody {...rest} className={cn('Table__body', className)} />
    </SectionContext.Provider>
  );
}

export interface TableRowProps extends JSX.HTMLAttributes<HTMLTableRowElement> {
  className?: string;
  children?: ComponentChildren;
}

/** A `<tr>`, striped or highlighted on hover in the body when the table asks. */
export function TableRow(props: TableRowProps) {
  const {className, ...rest} = props;
  const {striped, hover} = useContext(TableContext);
  const body = useContext(SectionContext) === 'body';
  return (
    <tr
      {...rest}
      className={cn(
        'Table__row',
        // Rows carry an opaque background, so a sticky first cell (which
        // inherits it) hides what scrolls beneath.
        'bg-surface',
        body && 'last:*:border-b-0',
        body && striped && 'odd:bg-surface-subtle',
        body && hover && 'hover:bg-surface-active',
        className
      )}
    />
  );
}

/** Cell classes shared by header and body cells. */
function useCellClasses() {
  const {dense, stickyFirstColumn, withColumnBorders} =
    useContext(TableContext);
  return cn(
    'border-0 border-b border-solid border-border text-left align-middle',
    withColumnBorders && 'not-last:border-r',
    dense ? 'px-2 py-1.5' : 'px-2.5 py-2.5',
    stickyFirstColumn &&
      'first:sticky first:left-0 first:z-(--cms-z-sticky) first:bg-inherit'
  );
}

export interface TableHeaderCellProps extends JSX.ThHTMLAttributes<HTMLTableCellElement> {
  className?: string;
  children?: ComponentChildren;
}

/** A `<th>`. Defaults `scope` to `col` in the head and `row` in the body. */
export function TableHeaderCell(props: TableHeaderCellProps) {
  const {className, scope, ...rest} = props;
  const section = useContext(SectionContext);
  return (
    <th
      {...rest}
      scope={scope ?? (section === 'head' ? 'col' : 'row')}
      className={cn(
        'Table__headerCell',
        useCellClasses(),
        'whitespace-nowrap font-bold text-muted',
        className
      )}
    />
  );
}

export interface TableCellProps extends JSX.TdHTMLAttributes<HTMLTableCellElement> {
  className?: string;
  children?: ComponentChildren;
}

/** A `<td>`. */
export function TableCell(props: TableCellProps) {
  const {className, ...rest} = props;
  return (
    <td {...rest} className={cn('Table__cell', useCellClasses(), className)} />
  );
}
