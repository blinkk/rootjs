import {Container} from '@/components/Container/Container';
import {Image, ImageProps} from '@/components/Image/Image';
import {TemplateImageFields} from '@/root-cms';
import {joinClassNames} from '@/utils/classes';
import styles from './TemplateImage.module.scss';

export type TemplateImageProps = TemplateImageFields & {
  className?: string;
};

export function TemplateImage(props: TemplateImageProps) {
  const options = props.options || [];
  return (
    <Container
      id={props.id}
      className={joinClassNames(
        props.className,
        ...options.map((option) => styles[option])
      )}
    >
      {props.image?.src && <Image {...(props.image as ImageProps)} />}
    </Container>
  );
}
