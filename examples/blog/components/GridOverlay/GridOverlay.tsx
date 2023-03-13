import {joinClassNames} from '@/utils/classes.js';
import {Container} from '@/components/Container/Container.js';
import styles from './GridOverlay.module.scss';

export function GridOverlay() {
  return (
    <root-grid-overlay className={styles.grid} aria-hidden="true">
      <Container className={styles.columns}>
        <div className={joinClassNames(styles.column, styles.all)}>1</div>
        <div className={joinClassNames(styles.column, styles.all)}>2</div>
        <div className={joinClassNames(styles.column, styles.all)}>3</div>
        <div className={joinClassNames(styles.column, styles.all)}>4</div>
        <div className={joinClassNames(styles.column, styles.tabletGt)}>5</div>
        <div className={joinClassNames(styles.column, styles.tabletGt)}>6</div>
        <div className={joinClassNames(styles.column, styles.laptopGt)}>7</div>
        <div className={joinClassNames(styles.column, styles.laptopGt)}>8</div>
        <div className={joinClassNames(styles.column, styles.laptopGt)}>9</div>
        <div className={joinClassNames(styles.column, styles.laptopGt)}>10</div>
        <div className={joinClassNames(styles.column, styles.laptopGt)}>11</div>
        <div className={joinClassNames(styles.column, styles.laptopGt)}>12</div>
      </Container>
      <div className={styles.breakpoint}></div>
    </root-grid-overlay>
  );
}
