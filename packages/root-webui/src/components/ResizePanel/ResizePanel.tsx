import React, {createRef, useEffect, useState} from 'react';
import {ActionIcon, Box, Tooltip} from '@mantine/core';
import {GrabberIcon} from '@primer/octicons-react';
import styles from './ResizePanel.module.scss';
import {joinClassNames} from '../../utils/joinClassNames';

export interface ResizePanelProps {
  className?: string;
  children?: [React.ReactNode, React.ReactNode];
  initialWidth?: number;
  onResize?: (width: number) => void;
}

export function ResizePanel({
  className,
  children,
  initialWidth,
  onResize,
}: ResizePanelProps) {
  if (children?.length !== 2) {
    throw new Error('ResizePanel should have two ResizePanel.Item children.');
  }

  const [isDragging, setIsDragging] = useState(false);

  if (typeof initialWidth !== 'number') {
    initialWidth = 300;
  }
  if (initialWidth > window.innerWidth) {
    initialWidth = window.innerWidth;
  }
  const [panelWidth, setPanelWidth] = useState(initialWidth);

  const containerRef = createRef<HTMLDivElement>();
  const leftRef = createRef<HTMLDivElement>();
  const rightRef = createRef<HTMLDivElement>();
  const grabberRef = createRef<HTMLButtonElement>();

  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const newPanelWidth = e.clientX;
      setPanelWidth(newPanelWidth);
      if (onResize) {
        onResize(newPanelWidth);
      }
    };
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
    }
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [isDragging]);

  return (
    <Box
      className={joinClassNames(className, styles.container)}
      ref={containerRef}
    >
      <div
        className={`${styles.panelContainer} ${styles.leftPanel}`}
        ref={leftRef}
        style={{width: panelWidth}}
      >
        <div
          className={styles.panelOverlay}
          style={{display: isDragging ? 'block' : 'none'}}
        ></div>
        {children[0]}
      </div>
      <div className={styles.divider}>
        <ActionIcon
          className={styles.dragger}
          ref={grabberRef}
          onMouseDown={() => setIsDragging(true)}
        >
          <Tooltip
            label="Drag left or right to resize."
            withArrow
            disabled={isDragging}
          >
            <GrabberIcon size={24} />
          </Tooltip>
        </ActionIcon>
      </div>
      <div
        className={`${styles.panelContainer} ${styles.rightPanel}`}
        ref={rightRef}
      >
        <div
          className={styles.panelOverlay}
          style={{display: isDragging ? 'block' : 'none'}}
        ></div>
        {children[1]}
      </div>
    </Box>
  );
}

export interface ResizePanelItemProps {
  className?: string;
  children: React.ReactNode;
  width?: number | string;
}

ResizePanel.Item = function ({
  className,
  children,
  width,
}: ResizePanelItemProps) {
  const style: React.CSSProperties = {};
  if (width) {
    style.width = width;
  }
  return (
    <Box className={joinClassNames(className, styles.container)} style={style}>
      {children}
    </Box>
  );
};
