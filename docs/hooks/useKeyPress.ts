import {useEffect} from 'preact/hooks';

export function useKeyPress(keyCode: string, callback: () => void) {
  const handler = (e: KeyboardEvent) => {
    if (keyCode.startsWith('ctrl+')) {
      if (e.ctrlKey && e.key === keyCode.slice(5)) {
        callback();
      }
    } else if (e.key === keyCode) {
      callback();
    }
  };
  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  });
}
