import {IconFileOff} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {FilePreview} from '../../../../components/FilePreview/FilePreview.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {getNestedValue} from '../../../../utils/objects.js';
import {DocStatusBadges} from '../../../documents/components/DocStatusBadges/DocStatusBadges.js';
import {getDocFromCacheOrFetch} from '../../../documents/doc-cache.js';

const CONTENT_CLASSES =
  'DocPreviewCard__content block min-w-0 flex-1 px-3 no-underline';

const HEADER_CLASSES =
  'DocPreviewCard__content__header flex items-center gap-3';

function docIdClasses(compact: boolean) {
  return cn(
    'DocPreviewCard__content__header__docId font-medium leading-tight',
    compact ? 'text-sm' : 'text-base'
  );
}

export interface DocPreviewCardProps {
  className?: string;
  variant?: 'default' | 'compact';
  docId: string;
  doc?: any;
  statusBadges?: boolean;
  hideReleases?: boolean;
  clickable?: boolean;
}

/** Classes for the card's root, shared by every state. */
function rootClasses(props: DocPreviewCardProps, ...modifiers: string[]) {
  return cn(
    'DocPreviewCard',
    ...modifiers,
    props.variant && `DocPreviewCard--${props.variant}`,
    'flex items-center overflow-hidden py-2',
    props.className
  );
}

/**
 * A row previewing a doc: its thumbnail, id, title and (optionally) status
 * badges. Fetches the doc unless `doc` is passed.
 */
export function DocPreviewCard(props: DocPreviewCardProps) {
  const docId = props.docId;
  const compact = props.variant === 'compact';
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
      <div className={rootClasses(props, 'DocPreviewCard--loading')}>
        <Spinner />
      </div>
    );
  }

  // If there is no doc (i.e. a stale reference to a doc that was deleted or
  // archived), show a "not found" indicator instead of a blank card.
  if (!doc) {
    return (
      <div
        className={rootClasses(props, 'DocPreviewCard--notfound', 'text-muted')}
      >
        <div className="DocPreviewCard__notfound__icon flex h-15 w-20 shrink-0 items-center justify-center border border-border bg-chip text-muted">
          <IconFileOff size={24} stroke={1.5} />
        </div>
        <div className={CONTENT_CLASSES}>
          <div className={HEADER_CLASSES}>
            <div className={docIdClasses(compact)}>{docId}</div>
          </div>
          <div
            className={cn(
              'DocPreviewCard__notfound__message font-medium italic',
              compact ? 'text-sm' : 'text-base'
            )}
          >
            Doc not found (was it deleted or archived?)
          </div>
        </div>
      </div>
    );
  }

  const [collection] = docId.split('/');
  const fields = doc.fields || {};
  const rootCollection = window.__ROOT_CTX.collections[collection];
  if (!rootCollection) {
    console.error(`could not find collection: ${collection}`);
    return (
      <div className={rootClasses(props)}>
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

  let Component: 'div' | 'a' = 'div';
  const attrs: Record<string, any> = {};
  if (props.clickable) {
    Component = 'a';
    attrs.href = `/cms/content/${props.docId}`;
    attrs.target = '_blank';
  }

  return (
    <Component
      className={rootClasses(
        props,
        Component === 'a' ? 'text-inherit no-underline' : ''
      )}
      {...attrs}
    >
      <div className="DocPreviewCard__image shrink-0 border border-border">
        <FilePreview
          file={previewImage}
          width={80}
          height={60}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div className={CONTENT_CLASSES}>
        <div className={HEADER_CLASSES}>
          <div className={docIdClasses(compact)}>{doc.id}</div>
        </div>
        <div className="DocPreviewCard__content__title line-clamp-1 text-2xl font-semibold leading-9">
          {previewTitle || '[UNTITLED]'}
        </div>
        {props.statusBadges && doc && (
          <div className="DocPreviewCard__content__badges">
            <DocStatusBadges doc={doc} hideReleases={props.hideReleases} />
          </div>
        )}
      </div>
    </Component>
  );
}
