import {useState} from 'preact/hooks';
import {useKeyPress} from '@/hooks/useKeyPress';
import {joinClassNames} from '@/utils/classes';
import styles from './GridOverlay.module.scss';

export function GridOverlay() {
  return (
    <root-island component="GridOverlay">
      <GridOverlay.Component />
    </root-island>
  );
}

GridOverlay.Component = () => {
  const [enabled, setEnabled] = useState(false);
  useKeyPress('ctrl+g', () => setEnabled((enabled: boolean) => !enabled));
  return (
    <div
      className={joinClassNames(styles.gridOverlay, enabled && styles.enabled)}
    >
      <div className={styles.grid}>
        <div className={styles.gridColumn}>1</div>
        <div className={styles.gridColumn}>2</div>
        <div className={styles.gridColumn}>3</div>
        <div className={styles.gridColumn}>4</div>
        <div className={styles.gridColumn}>5</div>
        <div className={styles.gridColumn}>6</div>
        <div className={styles.gridColumn}>7</div>
        <div className={styles.gridColumn}>8</div>
        <div className={styles.gridColumn}>9</div>
        <div className={styles.gridColumn}>10</div>
        <div className={styles.gridColumn}>11</div>
        <div className={styles.gridColumn}>12</div>
      </div>
      <div className={styles.breakpoint}>
        <span className={styles.breakpointLabel}>Breakpoint: </span>
      </div>
    </div>
  );
};
