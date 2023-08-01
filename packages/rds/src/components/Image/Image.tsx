import {Head} from '@blinkk/root';
import {useImageService} from '../../hooks/useImageService.js';
import {ResponsiveType, getResponsiveValue} from '../../utils/responsive.js';

export type ImageFormat = 'jpg' | 'png' | 'webp';

export type ImageProps = preact.JSX.HTMLAttributes<HTMLPictureElement> & {
  className?: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  /**
   * The width of the image to render at each breakpoint. Can either be a number
   * (e.g. `sizes={300}`) or a breakpoint map (e.g.
   * `sizes={{mobile: 300, tablet: 1200}}`).
   */
  sizes?: ResponsiveType<number>;
  preload?: boolean;
  format?: ImageFormat;
  loading?: 'lazy' | 'eager';
};

interface ImageMediaQuery {
  srcset: string[];
  mediaQuery?: string;
}

/** TODO(stevenle): Make these configurable through a context provider. */
const MediaQuery = {
  MOBILE: '(max-width: 499px)',
  TABLET: '(min-width: 500px) and (max-width: 1023px)',
  DESKTOP: '(min-width: 1024px)',
};

export function Image(props: ImageProps) {
  const {
    className,
    src,
    width,
    height,
    alt,
    sizes,
    preload,
    format,
    loading,
    ...attrs
  } = props;

  const sizesProp = sizes || width;
  const sizesMap = getResponsiveValue(sizesProp);
  const imageService = useImageService();

  // Default to the original size of the image.
  const defaultUrl = imageService.transform(src, {});

  // Generate a list of `<source>` tags using the image transform service.
  const sources: ImageMediaQuery[] = [];
  if (imageService.isSupported(src)) {
    if (typeof sizesProp === 'object') {
      sources.push({
        srcset: [
          imageService.transform(src, {width: sizesMap.mobile, format}),
          `${imageService.transform(src, {
            width: 2 * sizesMap.mobile,
            format,
          })} 2x`,
        ],
        mediaQuery: MediaQuery.MOBILE,
      });
      sources.push({
        srcset: [
          imageService.transform(src, {width: sizesMap.tablet, format}),
          `${imageService.transform(src, {
            width: 2 * sizesMap.tablet,
            format,
          })} 2x`,
        ],
        mediaQuery: MediaQuery.TABLET,
      });
      sources.push({
        srcset: [
          imageService.transform(src, {width: sizesMap.desktop, format}),
          `${imageService.transform(src, {
            width: 2 * sizesMap.desktop,
            format,
          })} 2x`,
        ],
        mediaQuery: MediaQuery.DESKTOP,
      });
    } else {
      const imageSize = sizesProp as number;
      sources.push({
        srcset: [
          imageService.transform(src, {width: imageSize, format}),
          `${imageService.transform(src, {
            width: 2 * imageSize,
            format,
          })} 2x`,
        ],
      });
    }
  } else {
    sources.push({
      srcset: [defaultUrl],
    });
  }

  const loadingAttr = loading || (preload ? 'eager' : 'lazy');
  return (
    <>
      {preload && (
        <Head>
          {sources.map((source) => (
            <link
              rel="preload"
              as="image"
              href={defaultUrl}
              imagesrcset={source.srcset.join(', ')}
              media={source.mediaQuery}
            />
          ))}
        </Head>
      )}
      <picture className={className} {...attrs}>
        {sources.map((source) => (
          <source srcSet={source.srcset.join(', ')} media={source.mediaQuery} />
        ))}
        <img
          src={defaultUrl}
          width={width}
          height={height}
          alt={alt}
          loading={loadingAttr}
          fetchpriority={preload ? 'high' : 'auto'}
        />
      </picture>
    </>
  );
}
