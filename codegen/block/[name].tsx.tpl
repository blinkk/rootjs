import {useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {node} from '@/components/RootNode/RootNode.js';
import {Text} from '@/components/Text/Text.js';
import {[[name]]Fields} from '@/root-cms.js';
import styles from './[[name]].module.scss';

export function [[name]](props: [[name]]Fields) {
  const t = useTranslations();
  return (
    <div className={styles.root}>
      {props.title && (
        <Text as="h2" className={styles.title}>
          {node('title', t(props.title))}
        </Text>
      )}
      {props.body && (
        <div className={styles.body}>
          {node('body', <RichText data={props.body} />)}
        </div>
      )}
    </div>
  );
}
