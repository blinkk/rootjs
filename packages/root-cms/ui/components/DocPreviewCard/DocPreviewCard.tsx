import './DocPreviewCard.css';

import {Loader} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {getDocFromCacheOrFetch} from '../../utils/doc-cache.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {notifyErrors} from '../../utils/notifications.js';
import {getNestedValue} from '../../utils/objects.js';
import {DocStatusBadges} from '../DocStatusBadges/DocStatusBadges.js';
import {FilePreview} from '../FilePreview/FilePreview.js';

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

  const [collection, slug] = docId.split('/');
  const fields = doc.fields || {};
  const rootCollection = window.__ROOT_CTX.collections[collection];
  if (!rootCollection) {
    console.error(`could not find collection: ${collection}`);
    return (
      <div className="DocPreviewCard">
        Collection <b>{collection}</b> not found.
      </div>
    );
  }
  const previewTitle = getNestedValue(
    fields,
    rootCollection.preview?.title || 'meta.title'
  );
  const previewImage =
    getNestedValue(fields, rootCollection.preview?.image || 'meta.image') ||
    rootCollection.preview?.defaultImage;
  const docServingUrl = getDocServingUrl({
    collectionId: collection,
    slug: slug,
  });

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
        <FilePreview
          file={previewImage}
          width={80}
          height={60}
          withPlaceholder={!previewImage?.src}
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
