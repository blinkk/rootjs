import styles from './GlobalFooter.module.scss';

export function GlobalFooter() {
  return (
    <footer className={styles.footer}>
      Built with <a href="https://rootjs.dev">Root.js</a>.
    </footer>
  );
}
