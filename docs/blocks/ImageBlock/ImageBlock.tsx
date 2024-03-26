import {Image, ImageProps} from '@/components/Image/Image';
import {ImageBlockFields} from '@/root-cms';

export type ImageBlockProps = ImageBlockFields;

export function ImageBlock(props: ImageBlockProps) {
  if (!props.image) {
    return null;
  }
  return <Image {...(props.image as ImageProps)} />;
}
