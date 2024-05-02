import Block from '@/components/Block/Block.js';
import {Container} from '@/components/Container/Container.js';
import {Template50x50Fields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './Template50x50.module.scss';

export type Template50x50Props = Template50x50Fields & {
  className?: string;
};

export function Template50x50(props: Template50x50Props) {
  const options = props.options || [];
  return (
    <Container
      id={props.id}
      className={joinClassNames(
        props.className,
        ...options.map((option) => styles[option])
      )}
    >
      <div className={styles.layout}>
        <div
          className={styles.layoutSection}
          data-type={props.leftSection?._type}
        >
          {props.leftSection?._type && <Block {...props.leftSection} />}
        </div>
        <div
          className={styles.layoutSection}
          data-type={props.rightSection?._type}
        >
          {props.rightSection?._type && <Block {...props.rightSection} />}
        </div>
      </div>
    </Container>
  );
}
