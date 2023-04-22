/* eslint-disable import/order */

import {B} from './b';
import styles from './a.module.scss';

export function A() {
  return (
    <div className={styles.componentA}>
      <B />
    </div>
  );
}
