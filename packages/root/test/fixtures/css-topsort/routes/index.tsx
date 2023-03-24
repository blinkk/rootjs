import {Layout} from '../components/layout';
import {A} from '../components/a';
import styles from './index.module.scss';

export default function Page() {
  return (
    <Layout>
      <h1>Hello world</h1>
      <div className={styles.route}>
        <A />
      </div>
    </Layout>
  );
}
