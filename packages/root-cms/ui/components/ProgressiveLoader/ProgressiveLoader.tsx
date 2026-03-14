import {Loader, Text} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import './ProgressiveLoader.css';

export interface ProgressiveLoaderProps {
  labels: string[];
}

export function ProgressiveLoader(props: ProgressiveLoaderProps) {
  const {labels} = props;
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentIndex((c) => (c + 1) % labels.length);
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentIndex, labels.length]);

  return (
    <div className="ProgressiveLoader">
      <Loader color="gray" size="md" />
      <div className="ProgressiveLoader__labels">
        <Text
          key={currentIndex}
          size="sm"
          color="dimmed"
          className="ProgressiveLoader__label--entering"
        >
          {labels[currentIndex]}
        </Text>
      </div>
    </div>
  );
}
