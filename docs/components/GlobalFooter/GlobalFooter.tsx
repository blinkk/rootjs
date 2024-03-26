import {Container} from '@/components/Container/Container';
import {Text} from '../Text/Text';
import styles from './GlobalFooter.module.scss';

export interface GlobalFooterProps {}

export function GlobalFooter(props: GlobalFooterProps) {
  return (
    <Container as="footer" id="footer" className={styles.footer}>
      <Text className={styles.builtBy} size="small">
        Built by the team at <a href="https://blinkk.com/">Blinkk</a>. Released
        under the MIT License.
      </Text>
      <Text className={styles.copyright} size="small">
        Copyright ©2023-present Blinkk.
      </Text>
    </Container>
  );
}
