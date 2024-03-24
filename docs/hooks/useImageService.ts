/**
 * The `useImageService()` hook returns an image service for transforming images
 * using URL parameters, e.g. resizing or converting to a different format.
 *
 * The image service can be configured using IMAGE_SERVICE_CONTEXT. For example:
 *
 * ```tsx
 * export function BaseLayout(props) {
 *   const imageService = new MyImageService();
 *   return (
 *     <IMAGE_SERVICE_CONTEXT.Provider value={imageService}>
 *       {props.children}
 *     </IMAGE_SERVICE_CONTEXT.Provider>
 *   );
 * }
 * ```
 */

import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {ImageFormat} from '../components/Image/Image.js';

export interface ImageTransformOptions {
  [key: string]: any;
  width?: number;
  format?: ImageFormat;
}

export interface ImageService {
  /** Transforms an image. */
  transform: (src: string, options: ImageTransformOptions) => string;
  /** Whether or not the image src is supported by the image service. */
  isSupported: (src: string) => boolean;
}

/**
 * Google Cloud Image (GCI) service, aka the App Engine Legacy Image API.
 * https://cloud.google.com/appengine/docs/legacy/standard/python/images
 */
export class GciImageService implements ImageService {
  /** Transforms an image. */
  transform(src: string, options: ImageTransformOptions) {
    if (!this.isSupported(src)) {
      return src;
    }

    let baseUrl = src;
    if (baseUrl.includes('=')) {
      baseUrl = baseUrl.split('=', 1)[0];
    }

    const transformOptions: string[] = [
      // e365 = cache image.
      'e365',
      // pa = preserve aspect ratio.
      'pa',
      // nu = no upscale (don't size image over original size).
      'nu',
    ];

    if (options.width) {
      transformOptions.push(`w${options.width}`);
    } else {
      transformOptions.push('s0');
    }

    if (options.format === 'webp') {
      transformOptions.push('rw');
    } else if (options.format === 'jpg') {
      transformOptions.push('rj');
    } else if (options.format === 'png') {
      transformOptions.push('rp');
    }

    const transformUrl = `${baseUrl}=${transformOptions.join('-')}`;
    return transformUrl;
  }

  /** Whether or not the image src is supported by the image service. */
  isSupported(src: string) {
    return src && src.startsWith('https://lh3.googleusercontent.com/');
  }
}

/**
 * Context provider for ImageService.
 *
 * Example usage:
 *
 * ```tsx
 * export function BaseLayout(props) {
 *   const imageService = new MyImageService();
 *   return (
 *     <IMAGE_SERVICE_CONTEXT.Provider value={imageService}>
 *       {props.children}
 *     </IMAGE_SERVICE_CONTEXT.Provider>
 *   );
 * }
 * ```
 */
export const IMAGE_SERVICE_CONTEXT = createContext<ImageService>(
  new GciImageService()
);

/**
 * The `useImageService()` hook returns an image service for transforming images
 * using URL parameters, e.g. resizing or converting to a different format.
 */
export function useImageService(): ImageService {
  return useContext(IMAGE_SERVICE_CONTEXT);
}
