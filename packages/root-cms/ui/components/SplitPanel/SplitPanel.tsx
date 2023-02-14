import {ComponentChild, ComponentChildren} from 'preact';
import {CSSProperties} from 'preact/compat';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useLocalStorage} from '@mantine/hooks';
import {joinClassNames} from '../../utils/classes.js';
import './SplitPanel.css';

export interface SplitPanelProps {
  className?: string;
  localStorageId?: string;
  children?: [ComponentChild, ComponentChild];
}

export function SplitPanel(props: SplitPanelProps) {
  const {className, localStorageId, children} = props;
  const [panelSize, setPanelSize] = useLocalStorage<number>({
    key: `root::SplitPanel:${localStorageId}`,
    defaultValue: 350,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

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
