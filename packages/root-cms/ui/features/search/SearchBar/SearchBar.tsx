import {IconSearch} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {Kbd} from '../../../primitives/Kbd/Kbd.js';
import {cn} from '../../../utils/classes.js';
import {openGlobalSearch} from '../GlobalSearch/GlobalSearch.js';

interface SearchBarProps {
  className?: string;
}

/**
 * A button styled like a search input that opens the global search when
 * clicked. Displays the platform-appropriate keyboard shortcut hint
 * (`⌘ + K` on macOS, `Ctrl + K` elsewhere) on the right. Below `md` it
 * shrinks to a search icon.
 */
export function SearchBar(props: SearchBarProps) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Detect macOS so we can render `⌘` instead of `Ctrl`.
    const platform =
      (navigator as any).userAgentData?.platform ?? navigator.platform;
    setIsMac(/mac/i.test(platform || ''));
  }, []);

  return (
    <button
      type="button"
      className={cn(
        'SearchBar',
        'flex size-control-md cursor-pointer appearance-none items-center justify-center gap-2 rounded-sm border-0 bg-transparent p-0 font-sans text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'md:h-8 md:w-60 md:justify-start md:border md:border-solid md:border-border md:bg-surface md:pl-3 md:pr-2',
        props.className
      )}
      onClick={() => openGlobalSearch()}
      aria-label="Open search"
    >
      <IconSearch className="SearchBar__icon shrink-0" size={16} stroke={1.5} />
      <span className="SearchBar__placeholder hidden flex-auto text-left text-base leading-none md:block">
        Search
      </span>
      <Kbd
        className="SearchBar__shortcut hidden text-muted md:inline-flex"
        aria-hidden="true"
      >
        {isMac ? '⌘ + K' : 'Ctrl + K'}
      </Kbd>
    </button>
  );
}
