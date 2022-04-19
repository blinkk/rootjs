import {Group, Kbd} from '@mantine/core';
import {RefObject, forwardRef, useEffect} from 'react';

import {showNotification} from '@mantine/notifications';
import styles from './ScreenSizeSimulator.module.scss';
import {useLocalStorage} from '@mantine/hooks';

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
  label: string;
  shortcut: string;
}

// TODO: Make these configurable.
export const ScreenSizeSimulatorBreakpoints = [
  {value: '', label: 'Default screen size', shortcut: '⌥⌃0'},
  {value: '320px', label: 'Mobile (320px)', shortcut: '⌥⌃1'},
  {value: '675px', label: 'Tablet (675px)', shortcut: '⌥⌃2'},
  {value: '1440px', label: 'Desktop (1440px)', shortcut: '⌥⌃3'},
  {value: '1920px', label: 'Large desktop (1920px)', shortcut: '⌥⌃4'},
];

export const ScreenSizeSimulatorSelectItem = forwardRef<
  HTMLDivElement,
  ItemProps
>((props: ItemProps, ref) => {
  return (
    <div ref={ref} {...props}>
      <Group noWrap position="apart">
        {props.label}
        <Kbd>{props.shortcut}</Kbd>
      </Group>
    </div>
  );
});

export function useScreenSizeSimulator(
  containerElement: RefObject<HTMLDivElement>
) {
  const [value, setValue] = useLocalStorage<string>({
    key: 'screenSizeSimulatorValue',
    defaultValue: '',
  });
  useEffect(() => {
    if (value) {
      // TODO: Replace existing notification rather than adding a new one.
      showNotification({
        message: `Simulated screen size to ${value}`,
        disallowClose: true,
      });
      containerElement.current.style.setProperty('--simulated-width', value);
      containerElement.current.classList.add(styles.container);
    } else {
      containerElement.current.classList.remove(styles.container);
      containerElement.current.style.removeProperty('--simulated-width');
    }
  }, [value]);
  return [value, setValue];
}
