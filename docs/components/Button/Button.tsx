import {useTranslations} from '@blinkk/root';
import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes';
import styles from './Button.module.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'outline';

export type ButtonProps = preact.JSX.HTMLAttributes<any> & {
  className?: string;
  variant?: ButtonVariant;
  label?: string;
  ariaLabel?: string;
  options?: string[];
  leftIcon?: ComponentChildren;
  rightIcon?: ComponentChildren;
  children?: ComponentChildren;
};

export function Button(props: ButtonProps) {
  const {className, label, leftIcon, rightIcon, children, ...attrs} = props;
  const t = useTranslations();

  const Component = props.href ? 'a' : 'button';

  return (
    <Component
      {...attrs}
      href={props.href}
      className={joinClassNames(
        className,
        styles.button,
        props.variant && styles[`variant:${props.variant}`],
        ...(props.options || []).map((option) => styles[option])
      )}
    >
      {leftIcon && (
        <div className={joinClassNames(styles.icon, styles.leftIcon)}>
          {leftIcon}
        </div>
      )}
      {label && <div className={styles.label}>{t(label)}</div>}
      {children && <div className={styles.label}>{children}</div>}
      {rightIcon && (
        <div className={joinClassNames(styles.icon, styles.rightIcon)}>
          {rightIcon}
        </div>
      )}
    </Component>
  );
}
