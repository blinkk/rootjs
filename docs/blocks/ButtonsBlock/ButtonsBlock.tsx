import {Button, ButtonProps} from '@/components/Button/Button';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList';
import {ButtonsBlockFields} from '@/root-cms';
import {joinClassNames} from '@/utils/classes';
import styles from './ButtonsBlock.module.scss';

export type ButtonsBlockProps = ButtonsBlockFields & {
  className?: string;
};

export function ButtonsBlock(props: ButtonsBlockProps) {
  const options = props.options || [];
  const buttons: ButtonProps[] = props.buttons || [];
  return (
    <UnstyledList
      className={joinClassNames(
        props.className,
        styles.buttonsBlock,
        ...options.map((option) => styles[option])
      )}
    >
      {buttons.map((button) => (
        <li>
          <Button {...button} />
        </li>
      ))}
    </UnstyledList>
  );
}
