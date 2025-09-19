import './DocPreviewCard.css';

import {Image, Loader} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {getDocFromCacheOrFetch} from '../../utils/doc-cache.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {notifyErrors} from '../../utils/notifications.js';
import {getNestedValue} from '../../utils/objects.js';
import {DocStatusBadges} from '../DocStatusBadges/DocStatusBadges.js';

export interface DocPreviewCardProps {
  className?: string;
  variant?: 'default' | 'compact';
  docId: string;
  doc?: any;
  statusBadges?: boolean;
  clickable?: boolean;
}

export function DocPreviewCard(props: DocPreviewCardProps) {
  const docId = props.docId;
  const [doc, setDoc] = useState<any>(props.doc);
  const [loading, setLoading] = useState(!props.doc);

  async function fetchDocData() {
    setLoading(true);
    await notifyErrors(async () => {
      const data = await getDocFromCacheOrFetch(docId);
      setDoc(data);
    });
    setLoading(false);
  }

  useEffect(() => {
    fetchDocData();
  }, [docId]);

  const [collection, slug] = docId.split('/');
  const fields = doc?.fields || {};
  const rootCollection = window.__ROOT_CTX.collections[collection];
  if (!rootCollection) {
    throw new Error(`could not find collection: ${collection}`);
  }
  const previewTitle = getNestedValue(
    fields,
    rootCollection.preview?.title || 'meta.title'
  );
  const previewImage =
    getNestedValue(fields, rootCollection.preview?.image || 'meta.image') ||
    rootCollection.preview?.defaultImage;
  const previewImageSrc =
    typeof previewImage === 'string' ? previewImage : previewImage?.src;
  const previewImageMimeType =
    typeof previewImage === 'object' && previewImage
      ? previewImage.mimeType ||
        previewImage.contentType ||
        previewImage.type ||
        previewImage.file?.type
      : undefined;
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(
    previewImageSrc
  );
  const docServingUrl = getDocServingUrl({
    collectionId: collection,
    slug: slug,
  });

  useEffect(() => {
    if (!previewImageSrc) {
      setPreviewSrc(undefined);
      return;
    }

    const isMp4 =
      (typeof previewImageMimeType === 'string' &&
        previewImageMimeType.toLowerCase().includes('mp4')) ||
      /\.mp4(?:$|\?)/i.test(previewImageSrc);

    if (!isMp4) {
      setPreviewSrc(previewImageSrc);
      return;
    }

    let cancelled = false;
    setPreviewSrc(undefined);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const cleanupVideo = () => {
      video.pause();
      video.removeAttribute('src');
      try {
        video.load();
      } catch (error) {
        // Ignore load errors during cleanup.
      }
    };

    const handleLoadedData = () => {
      if (cancelled) {
        cleanupVideo();
        return;
      }

      try {
        if (!video.videoWidth || !video.videoHeight) {
          throw new Error('Video dimensions unavailable');
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Unable to get canvas context');
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        if (!cancelled) {
          setPreviewSrc(dataUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewSrc(undefined);
        }
      } finally {
        cleanupVideo();
      }
    };

    const handleError = () => {
      if (!cancelled) {
        setPreviewSrc(undefined);
      }
      cleanupVideo();
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    video.src = previewImageSrc;
    try {
      video.load();
    } catch (error) {
      // Ignore load errors; the error event handler will handle failures.
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      cleanupVideo();
    };
  }, [previewImageMimeType, previewImageSrc]);

  if (loading) {
    return (
      <div
        className={joinClassNames(
          props.className,
          'DocPreviewCard',
          'DocPreviewCard--loading',
          props.variant && `DocPreviewCard--${props.variant}`
        )}
      >
        <Loader color="gray" size="sm" />
      </div>
    );
  }

  let Component: 'div' | 'a' = 'div';
  const attrs: Record<string, any> = {};
  if (props.clickable) {
    Component = 'a';
    attrs.href = `/cms/content/${props.docId}`;
    attrs.target = '_blank';
  }

  return (
    <Component
      className={joinClassNames(
        props.className,
        'DocPreviewCard',
        props.variant && `DocPreviewCard--${props.variant}`
      )}
      {...attrs}
    >
      <div className="DocPreviewCard__image">
        <Image
          src={previewSrc}
          width={80}
          height={60}
          withPlaceholder={!previewSrc}
        />
      </div>
      <div className="DocPreviewCard__content">
        <div className="DocPreviewCard__content__header">
          <div className="DocPreviewCard__content__header__docId">{doc.id}</div>
          {props.statusBadges && doc && <DocStatusBadges doc={doc} />}
        </div>
        <div className="DocPreviewCard__content__title">
          {previewTitle || '[UNTITLED]'}
        </div>
        {props.variant !== 'compact' && docServingUrl && (
          <div className="DocPreviewCard__content__url">{docServingUrl}</div>
        )}
      </div>
    </Component>
  );
}
