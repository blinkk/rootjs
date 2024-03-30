import {Text} from '@/components/Text/Text';
import {BaseLayout} from '@/layouts/BaseLayout';
import styles from './404.module.scss';

export default function Page() {
  return (
    <BaseLayout title="404 Not Found – Root.js" noindex>
      <div className={styles.content}>
        <Text as="h1" size="h3">
          404 Not Found
        </Text>
        <Text as="p" size="p-large">
          The page you are looking for was not found.
        </Text>
      </div>
    </BaseLayout>
  );
}
