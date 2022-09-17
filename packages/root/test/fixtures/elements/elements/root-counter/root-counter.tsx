/* eslint-disable @typescript-eslint/no-namespace */

import {useState} from 'preact/hooks';
import register from 'preact-custom-element';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-counter': CounterProps;
    }
  }
}

interface CounterProps {
  start?: number;
}

function Counter(props: CounterProps) {
  const [count, setCount] = useState(props.start || 0);
  return (
    <>
      <div>Count: {count}</div>
      <button onClick={() => setCount(count - 1)}>Subtract</button>
      <button onClick={() => setCount(count + 1)}>Add</button>
    </>
  );
}

register(Counter, 'root-counter');
