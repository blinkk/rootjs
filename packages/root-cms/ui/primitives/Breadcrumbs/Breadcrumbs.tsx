import type {ComponentChildren, JSX} from 'preact';
import {cn} from '../../utils/classes.js';

export interface BreadcrumbItem {
  /** The crumb's text, e.g. "Releases" or a doc id. */
  label: ComponentChildren;
  /** Where it links. Leave unset on the last item (the current page). */
  href?: string;
}

export interface BreadcrumbsProps extends Omit<
  JSX.HTMLAttributes<HTMLElement>,
  'separator'
> {
  /** The trail, from the top-level page to the current one. */
  items: BreadcrumbItem[];
  /** What goes between crumbs. Default "/". */
  separator?: ComponentChildren;
  /** Names the landmark for screen readers. Default "Breadcrumb". */
  'aria-label'?: string;
  className?: string;
}

/**
 * The trail of pages above the current one. The last item is the current
 * page (`aria-current="page"`). Below `sm`, trails longer than two items
 * collapse their middle into "…" (still read by screen readers), and long
 * labels truncate. Replaces Mantine's `Breadcrumbs`.
 *
 * ```tsx
 * <Breadcrumbs
 *   items={[
 *     {label: 'Releases', href: '/cms/releases'},
 *     {label: release.id, href: `/cms/releases/${release.id}`},
 *     {label: 'Edit'},
 *   ]}
 * />
 * ```
 */
export function Breadcrumbs(props: BreadcrumbsProps) {
  const {
    items,
    separator = '/',
    'aria-label': ariaLabel = 'Breadcrumb',
    className,
    ...rest
  } = props;
  const last = items.length - 1;
  const collapsible = items.length > 2;

  const sep = (
    <span
      className="Breadcrumbs__separator shrink-0 px-2 text-muted"
      aria-hidden="true"
    >
      {separator}
    </span>
  );

  return (
    <nav
      {...rest}
      aria-label={ariaLabel}
      className={cn('Breadcrumbs', 'min-w-0 text-sm', className)}
    >
      <ol className="Breadcrumbs__list m-0 flex min-w-0 list-none items-center p-0">
        {items.map((item, i) => {
          const current = i === last;
          const middle = collapsible && i > 0 && i < last;
          return [
            // The "…" stand-in for the collapsed middle, on narrow screens.
            collapsible && i === 1 && (
              <li
                key="ellipsis"
                className="Breadcrumbs__ellipsis flex shrink-0 items-center text-muted sm:hidden"
                aria-hidden="true"
              >
                {sep}…
              </li>
            ),
            <li
              key={i}
              className={cn(
                'Breadcrumbs__item flex min-w-0 items-center',
                // Keep the first crumb whole; let the current page truncate.
                current ? 'shrink' : 'shrink-0',
                middle && 'max-sm:sr-only'
              )}
            >
              {i > 0 && sep}
              {current || !item.href ? (
                <span
                  className="Breadcrumbs__current truncate text-fg"
                  aria-current={current ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  className="Breadcrumbs__link truncate font-medium text-fg underline underline-offset-4 hover:text-strong focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  href={item.href}
                >
                  {item.label}
                </a>
              )}
            </li>,
          ];
        })}
      </ol>
    </nav>
  );
}
