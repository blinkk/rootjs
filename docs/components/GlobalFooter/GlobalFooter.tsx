import {Container} from '@/components/Container/Container.js';
import {Text} from '@/components/Text/Text.js';
import styles from './GlobalFooter.module.scss';

export function GlobalFooter() {
  return (
    <Container as="footer" id="footer" className={styles.footer}>
      <Text className={styles.builtBy} size="small">
        Built by the team at{' '}
        <a href="https://blinkk.com/?utm_source=rootjs&utm_medium=website&utm_campaign=rootjs-footer">
          Blinkk
        </a>
        . Released under the MIT License.
      </Text>
      <Text className={styles.copyright} size="small">
        Copyright ©2023-present Blinkk.
      </Text>
    </Container>
  );
}
