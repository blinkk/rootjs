import {Image, Loader} from '@mantine/core';
import {getDoc} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {getDraftDocRef} from '../../utils/doc.js';
import {getNestedValue} from '../../utils/objects.js';
import './DocPreviewCard.css';

const DOC_PREVIEW_CACHE: Record<string, any> = {};

export interface DocPreviewCardProps {
  className?: string;
  variant?: 'default' | 'compact';
  docId: string;
  doc?: any;
}

export function DocPreviewCard(props: DocPreviewCardProps) {
  const docId = props.docId;
  const [doc, setDoc] = useState<any>(props.doc);
  const [loading, setLoading] = useState(!props.doc);

  async function fetchDocData() {
    setLoading(true);
    const docRef = getDraftDocRef(docId);
    const snapshot = await getDoc(docRef);
    const data = snapshot.data();
    DOC_PREVIEW_CACHE[docId] = data;
    setDoc(data);
    setLoading(false);
  }

  useEffect(() => {
    const cachedValue = DOC_PREVIEW_CACHE[docId];
    if (cachedValue) {
      setDoc(cachedValue);
      setLoading(false);
      return;
    }
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
    throw new Error(`could not find collection: ${collection}`);
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

  return (
    <div
      className={joinClassNames(
        'DocPreviewCard',
        props.variant && `DocPreviewCard--${props.variant}`
      )}
    >
      <div className="DocPreviewCard__image">
        <Image
          src={previewImage?.src}
          width={80}
          height={60}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div className="DocPreviewCard__content">
        <div className="DocPreviewCard__content__header">
          <div className="DocPreviewCard__content__header__docId">{doc.id}</div>
        </div>
        <div className="DocPreviewCard__content__title">
          {previewTitle || '[UNTITLED]'}
        </div>
        {props.variant !== 'compact' && docServingUrl && (
          <div className="DocPreviewCard__content__url">{docServingUrl}</div>
        )}
      </div>
    </div>
  );
}
