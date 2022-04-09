import {AppShell as MantineAppShell} from '@mantine/core';
import {AppHeader} from './AppHeader';

export function AppShell(props: any) {
  return (
    <MantineAppShell padding="md" header={<AppHeader />}>
      {props.children}
    </MantineAppShell>
  );
}
