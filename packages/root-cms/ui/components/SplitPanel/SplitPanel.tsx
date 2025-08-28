import {ComponentChild, ComponentChildren, createContext} from 'preact';
import {CSSProperties} from 'preact/compat';
import {useContext, useEffect, useMemo, useRef, useState} from 'preact/hooks';

import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {joinClassNames} from '../../utils/classes.js';
import './SplitPanel.css';

interface SplitPanelContextValue {
  onResize: (callback: () => void) => () => void;
}

const SplitPanelContext = createContext<SplitPanelContextValue | null>(null);

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
  children?: [ComponentChild, ComponentChild];
}

export function SplitPanel(props: SplitPanelProps) {
  const {className, localStorageId, children} = props;
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
  return (
    <SplitPanelContext.Provider value={contextValue}>
      <div
        className={joinClassNames(
          className,
          'SplitPanel',
          isDragging && 'dragging'
        )}
        ref={containerRef}
        style={style}
      >
        {children[0]}
        <div
          className="SplitPanel__divider"
          ref={dividerRef}
          onMouseDown={() => setIsDragging(true)}
        ></div>
        {children[1]}
      </div>
    </SplitPanelContext.Provider>
  );
}

export interface SplitPanelItemProps {
  className?: string;
  children: ComponentChildren;
  fluid?: boolean;
}

SplitPanel.Item = (props: SplitPanelItemProps) => {
  return (
    <div
      className={joinClassNames(
        'SplitPanel__item',
        props.className,
        props.fluid ? 'fluid' : 'static'
      )}
    >
      {props.children}
    </div>
  );
};
