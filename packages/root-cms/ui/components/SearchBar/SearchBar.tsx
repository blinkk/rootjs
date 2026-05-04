import './SearchBar.css';
import {openSpotlight} from '@mantine/spotlight';
import {IconSearch} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';

interface SearchBarProps {
  className?: string;
}

/**
 * A button styled like a search input that opens the global Spotlight search
 * when clicked. Displays the platform-appropriate keyboard shortcut hint
 * (`⌘ + K` on macOS, `Ctrl + K` elsewhere) on the right.
 */
export function SearchBar(props: SearchBarProps) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Detect macOS so we can render `⌘` instead of `Ctrl`.
    const platform =
      (navigator as any).userAgentData?.platform ?? navigator.platform;
    setIsMac(/mac/i.test(platform || ''));
  }, []);

  const onClick = () => {
    openSpotlight();
  };

  return (
    <button
      type="button"
      className={joinClassNames('SearchBar', props.className)}
      onClick={onClick}
      aria-label="Open search"
    >
      <IconSearch className="SearchBar__icon" size={16} stroke={1.5} />
      <span className="SearchBar__placeholder">Search</span>
      <span className="SearchBar__shortcut" aria-hidden="true">
        {isMac ? '⌘ + K' : 'Ctrl + K'}
      </span>
    </button>
  );
}
