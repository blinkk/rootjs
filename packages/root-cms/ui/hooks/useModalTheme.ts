import {useMantineTheme} from '@mantine/core';

export function useModalTheme() {
  const theme = useMantineTheme();
  const overlayColor =
    theme.colorScheme === 'dark' ? theme.colors.dark[9] : theme.colors.gray[2];
  return {
    overlayColor: overlayColor,
    overlayOpacity: 0.55,
    overlayBlur: 3,
  };
}
