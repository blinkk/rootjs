import {useTranslations} from '@blinkk/root';
import {Image, ImageProps} from '@/components/Image/Image';
import {Text} from '@/components/Text/Text';
import {useImageService} from '@/hooks/useImageService';
import {ImageBlockFields} from '@/root-cms';
import {joinClassNames} from '@/utils/classes';
import styles from './ImageBlock.module.scss';

export type ImageBlockProps = ImageBlockFields & {
  className?: string;
};

export function ImageBlock(props: ImageBlockProps) {
  if (!props.image?.src) {
    return null;
  }

  const options = props.options || [];
  const t = useTranslations();
  const imageService = useImageService();
  const ImageWrapper = options.includes('open-in-new-tab') ? 'a' : 'div';
  const imageWrapperProps: any = {};
  if (options.includes('open-in-new-tab')) {
    const imageSrc = imageService.transform(props.image.src, {width: 1800});
    imageWrapperProps.href = imageSrc;
    imageWrapperProps.target = '_blank';
  }
  return (
    <figure
      className={joinClassNames(
        props.className,
        styles.imageBlock,
        ...options.map((option) => styles[option])
      )}
    >
      <ImageWrapper {...imageWrapperProps}>
        <Image {...(props.image as ImageProps)} />
      </ImageWrapper>
      {props.caption && (
        <Text className={styles.caption} as="figcaption" size="small">
          {t(props.caption)}
        </Text>
      )}
    </figure>
  );
}
