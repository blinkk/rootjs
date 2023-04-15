import styles from './a.module.scss';
import {B} from './b';

export function A() {
  return (
    <div className={styles.componentA}>
      <B />
    </div>
  );
}
