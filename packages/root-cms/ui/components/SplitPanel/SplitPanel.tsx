import {ComponentChild, ComponentChildren, createContext} from 'preact';
import {CSSProperties} from 'preact/compat';
import {useContext, useEffect, useMemo, useRef, useState} from 'preact/hooks';

import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {Tab, TabList, Tabs} from '../../primitives/Tabs/Tabs.js';
import {joinClassNames} from '../../utils/classes.js';
import './SplitPanel.css';

interface SplitPanelContextValue {
  onResize: (callback: () => void) => () => void;
}

const SplitPanelContext = createContext<SplitPanelContextValue | null>(null);

/**
 * Which panel an item is (0 or 1), and whether it's hidden below `md`
 * because the other panel's tab is selected.
 */
const SplitPanelItemContext = createContext<{mobileHidden: boolean}>({
  mobileHidden: false,
});

export function useSplitPanel() {
  const context = useContext(SplitPanelContext);
  if (!context) {
    throw new Error('useSplitPanel must be used within a SplitPanel');
  }
  return context;
}

export interface SplitPanelProps {
  className?: string;
  localStorageId?: string;
  /**
   * Labels for the two panels, e.g. `['Edit', 'Preview']`. Below `md` the
   * panels become tabs with these labels, one panel at a time. Without
   * them, the panels stack and scroll together below `md`.
   */
  mobileTabs?: [string, string];
  children?: [ComponentChild, ComponentChild];
}

export function SplitPanel(props: SplitPanelProps) {
  const {className, localStorageId, mobileTabs, children} = props;
  const [mobileTab, setMobileTab] = useState('0');
  const [panelSize, setPanelSize] = useLocalStorage<number>(
    `root::SplitPanel:${localStorageId}`,
    350
  );
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const resizeCallbacks = useMemo(() => new Set<() => void>(), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  const contextValue: SplitPanelContextValue = {
    onResize: (callback: () => void) => {
      resizeCallbacks.add(callback);
      return () => {
        resizeCallbacks.delete(callback);
      };
    },
  };

  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', onMouseUp);

    const container = containerRef.current;
    if (container) {
      setOffset(container.getBoundingClientRect().left);
    }
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const newPanelWidth = e.clientX - offset;
      setPanelSize(newPanelWidth);
      // Trigger all registered resize callbacks
      resizeCallbacks.forEach((callback) => callback());
    };
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
    }
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [isDragging]);

  if (children?.length !== 2) {
    throw new Error('SplitPanel should have two <SplitPanel.Item> children.');
  }

  const style: CSSProperties = {
    '--panel-size': `${panelSize}px`,
  };
  const panel = (index: 0 | 1) => (
    <SplitPanelItemContext.Provider
      value={{mobileHidden: !!mobileTabs && mobileTab !== String(index)}}
    >
      {children[index]}
    </SplitPanelItemContext.Provider>
  );
  // The tree is the same with or without tabs, so toggling them (e.g. when
  // a page hides its preview) doesn't remount the panels.
  return (
    <SplitPanelContext.Provider value={contextValue}>
      <Tabs
        className="SplitPanel__tabsRoot contents"
        value={mobileTab}
        onChange={setMobileTab}
        grow
      >
        <div
          className={joinClassNames(
            className,
            'SplitPanel',
            mobileTabs
              ? 'SplitPanel--mobile-tabs'
              : 'SplitPanel--mobile-stacked',
            isDragging && 'dragging'
          )}
          ref={containerRef}
          style={style}
        >
          {mobileTabs && (
            <TabList className="SplitPanel__tabs px-2" aria-label="Panels">
              <Tab value="0">{mobileTabs[0]}</Tab>
              <Tab value="1">{mobileTabs[1]}</Tab>
            </TabList>
          )}
          {panel(0)}
          <div
            className="SplitPanel__divider"
            ref={dividerRef}
            onMouseDown={() => setIsDragging(true)}
          ></div>
          {panel(1)}
        </div>
      </Tabs>
    </SplitPanelContext.Provider>
  );
}

export interface SplitPanelItemProps {
  className?: string;
  children: ComponentChildren;
  fluid?: boolean;
}

SplitPanel.Item = (props: SplitPanelItemProps) => {
  const {mobileHidden} = useContext(SplitPanelItemContext);
  return (
    <div
      className={joinClassNames(
        'SplitPanel__item',
        props.className,
        props.fluid ? 'fluid' : 'static',
        mobileHidden && 'SplitPanel__item--mobile-hidden'
      )}
    >
      {props.children}
    </div>
  );
};
