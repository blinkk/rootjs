import {AppShell, AppShellProps} from '@mantine/core';
import {AppHeader} from '../AppHeader/AppHeader';

export function WebUIShell(props: AppShellProps) {
  return (
    <AppShell {...props} padding="md" header={<AppHeader />}>
      {props.children}
    </AppShell>
  );
}
