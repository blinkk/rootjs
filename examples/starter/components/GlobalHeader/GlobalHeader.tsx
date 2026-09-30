import styles from './GlobalHeader.module.scss';

export function GlobalHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.logo} href="/">
        Root.js
      </a>
    </header>
  );
}
