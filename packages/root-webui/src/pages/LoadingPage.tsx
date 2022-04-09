import {Loader} from '@mantine/core';
import styles from './LoadingPage.module.sass';

export function LoadingPage() {
  return (
    <div className={styles.LoadingPage}>
      <Loader color="lime" variant="dots" />
    </div>
  );
}
