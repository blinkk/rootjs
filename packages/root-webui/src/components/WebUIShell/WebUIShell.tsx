import {AppShell, AppShellProps} from '@mantine/core';
import {WebUIHeader} from './WebUIHeader';

export function WebUIShell(props: AppShellProps) {
  return (
    <AppShell {...props} padding="md" header={<WebUIHeader />}>
      {props.children}
    </AppShell>
  );
}
