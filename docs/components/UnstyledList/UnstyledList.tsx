import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes';
import styles from './UnstyledList.module.scss';

export interface UnstyledListProps {
  as?: 'ul' | 'ol';
  className?: string;
  children?: ComponentChildren;
}

export function UnstyledList(props: UnstyledListProps) {
  const Component = props.as || 'ul';
  return (
    <Component className={joinClassNames(props.className, styles.unstyledList)}>
      {props.children}
    </Component>
  );
}
