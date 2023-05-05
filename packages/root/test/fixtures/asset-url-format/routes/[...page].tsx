import styles from './page.module.scss';

export default function Page() {
  return <h1 className={styles.heading}>Hello, world!</h1>;
}

export async function getStaticPaths() {
  return {paths: []};
}
