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
  const offsetRef = useRef(0);
  const dragSizeRef = useRef<number | null>(null);
  const resizeCallbacks = useMemo(() => new Set<() => void>(), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  const contextValue = useMemo<SplitPanelContextValue>(
    () => ({
      onResize: (callback: () => void) => {
        resizeCallbacks.add(callback);
        return () => {
          resizeCallbacks.delete(callback);
        };
      },
    }),
    [resizeCallbacks]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      offsetRef.current = container.getBoundingClientRect().left;
    }
  }, []);

  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const onMouseMove = (e: MouseEvent) => {
      const newPanelWidth = e.clientX - offsetRef.current;
      dragSizeRef.current = newPanelWidth;
      containerRef.current?.style.setProperty(
        '--panel-size',
        `${newPanelWidth}px`
      );
      // Trigger all registered resize callbacks.
      resizeCallbacks.forEach((callback) => callback());
    };
    const onMouseUp = () => {
      if (dragSizeRef.current !== null) {
        setPanelSize(dragSizeRef.current);
        dragSizeRef.current = null;
      }
      setIsDragging(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, resizeCallbacks, setPanelSize]);

  if (children?.length !== 2) {
    throw new Error('SplitPanel should have two <SplitPanel.Item> children.');
  }

  const style: CSSProperties = {
    '--panel-size': `${panelSize}px`,
  };
  // Below `md` the panels stack and scroll together (see SplitPanel.css).
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
          onMouseDown={() => {
            if (containerRef.current) {
              offsetRef.current =
                containerRef.current.getBoundingClientRect().left;
            }
            setIsDragging(true);
          }}
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
