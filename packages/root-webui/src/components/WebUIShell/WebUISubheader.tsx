import {Group} from '@mantine/core';
import styles from './WebUISubheader.module.scss';

interface WebUISubheaderProps {
  children: React.ReactNode;
}

export function WebUISubheader(props: WebUISubheaderProps) {
  return (
    <Group className={styles.container} spacing={0} grow>
      {props.children}
    </Group>
  );
}
