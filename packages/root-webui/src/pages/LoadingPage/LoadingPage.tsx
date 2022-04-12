import {Loader} from '@mantine/core';
import styles from './LoadingPage.module.scss';

export function LoadingPage() {
  return (
    <div className={styles.LoadingPage}>
      <Loader variant="dots" />
    </div>
  );
}
