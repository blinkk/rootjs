import {Head} from '@blinkk/root';
import {useImageService} from '@/hooks/useImageService';
import {ResponsiveType, getResponsiveValue} from '@/utils/responsive';

declare module 'preact' {
  namespace JSX {
    interface HTMLAttributes {
      imagesrcset?: string;
      fetchpriority?: 'high' | 'low' | 'auto';
    }
  }
}

export type ImageFormat = 'jpg' | 'png' | 'webp';

export type ImageProps = {
  className?: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  /**
   * The width of the image to render at each breakpoint. Can either be a number
   * (e.g. `sizes={300}`) or a breakpoint map (e.g.
   * `sizes={{sm: 300, md: 1200, default: 1440}}`).
   */
  sizes?: ResponsiveType<number>;
  /** Whether to append a `<link rel="preload">` tag in `<head>`. */
  preload?: boolean;
  /** Converts the image to a specific format. */
  format?: ImageFormat;
  loading?: 'lazy' | 'eager';
  /** Props to append to the <img> element. */
  imgProps?: preact.JSX.HTMLAttributes<HTMLImageElement>;
};

interface ImageMediaQuery {
  srcset: string[];
  mediaQuery?: string;
}

/** TODO(stevenle): Make these configurable through a context provider. */
const MediaQuery = {
  SM: '(max-width: 499.98px)',
  MD: '(min-width: 500px) and (max-width: 1023.98px)',
  LG: '(min-width: 1024px) and (max-width: 1439.98)',
  XL: '(min-width: 1440px)',
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
    imgProps,
  } = props;

  const sizesMap = getResponsiveValue(sizes || width);
  const imageService = useImageService();

  // Default to the original size of the image.
  const defaultUrl = imageService.transform(src, {});

  function srcset2x(width: number) {
    return [
      `${imageService.transform(src, {width: 2 * width, format})} 2x`,
      imageService.transform(src, {width, format}),
    ];
  }

  // Generate a list of `<source>` tags using the image transform service.
  const sources: ImageMediaQuery[] = [];
  if (imageService.isSupported(src)) {
    if (sizesMap.sm) {
      sources.push({
        srcset: srcset2x(sizesMap.sm),
        mediaQuery: MediaQuery.SM,
      });
    }
    if (sizesMap.md) {
      sources.push({
        srcset: srcset2x(sizesMap.md),
        mediaQuery: MediaQuery.MD,
      });
    }
    if (sizesMap.lg) {
      sources.push({
        srcset: srcset2x(sizesMap.lg),
        mediaQuery: MediaQuery.LG,
      });
    }
    if (sizesMap.xl) {
      sources.push({
        srcset: srcset2x(sizesMap.xl),
        mediaQuery: MediaQuery.XL,
      });
    }
    if (sizesMap.default) {
      sources.push({
        srcset: srcset2x(sizesMap.default),
      });
    }
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
      <picture className={className}>
        {sources.map((source) => (
          <source srcSet={source.srcset.join(', ')} media={source.mediaQuery} />
        ))}
        <img
          {...imgProps}
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
