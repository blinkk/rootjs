import './ProgressiveLoader.css';

import {useEffect, useState} from 'preact/hooks';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';

export interface ProgressiveLoaderProps {
  labels: string[];
}

/** A spinner with a label that cycles through `labels` every 2 seconds. */
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
    <div className="ProgressiveLoader flex flex-col items-center justify-center gap-2.5 py-20">
      <Spinner size="lg" label={null} className="size-9 text-muted" />
      <div
        className="ProgressiveLoader__labels relative flex min-h-6 items-center justify-center"
        role="status"
      >
        <div
          key={currentIndex}
          className="ProgressiveLoader__label text-base text-muted"
        >
          {labels[currentIndex]}
        </div>
      </div>
    </div>
  );
}
