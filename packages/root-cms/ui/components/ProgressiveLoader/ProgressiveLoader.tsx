import {Loader, Text} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import './ProgressiveLoader.css';

export interface ProgressiveLoaderProps {
  labels: string[];
}

export function ProgressiveLoader(props: ProgressiveLoaderProps) {
  const {labels} = props;
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    if (visibleCount >= labels.length) return;
    const timer = setTimeout(() => {
      setVisibleCount((c) => Math.min(c + 1, labels.length));
    }, 2000);
    return () => clearTimeout(timer);
  }, [visibleCount, labels.length]);

  return (
    <div className="ProgressiveLoader">
      <Loader color="gray" size="md" />
      <div className="ProgressiveLoader__labels">
        {labels.slice(0, visibleCount).map((label, i) => (
          <Text
            key={i}
            size="sm"
            color="dimmed"
            className={
              i === visibleCount - 1
                ? 'ProgressiveLoader__label--entering'
                : undefined
            }
          >
            {label}
          </Text>
        ))}
      </div>
    </div>
  );
}
