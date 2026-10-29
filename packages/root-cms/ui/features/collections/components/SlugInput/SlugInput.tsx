import {useRef, useState} from 'preact/hooks';
import {
  getSlugError,
  isSlugValid,
  normalizeSlug,
} from '../../../../../shared/slug.js';
import {Text} from '../../../../components/Text/Text.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../utils/classes.js';
import {getDocServingUrl} from '../../../documents/doc-urls.js';

export interface SlugInputProps {
  className?: string;
  collectionId?: string;
  collectionDisabled?: boolean;
  /**
   * Initial value to populate the slug input with. Used to pre-fill the
   * field on mount; remount the component (e.g. via a changing `key`) to
   * reset it to a new initial value.
   */
  initialSlug?: string;
  onChange?: (newValue: {collectionId: string; slug: string}) => void;
}

export function SlugInput(props: SlugInputProps) {
  const [collectionId, setCollectionId] = useState(props.collectionId || '');
  const slugRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState(props.initialSlug || '');

  const rootCollection = window.__ROOT_CTX.collections[collectionId];
  const collectionOptions: Array<{value: string; label: string}> = [];
  if (props.collectionId && props.collectionDisabled) {
    collectionOptions.push({
      value: props.collectionId,
      label: props.collectionId,
    });
  } else {
    Object.keys(window.__ROOT_CTX.collections).forEach((id) => {
      collectionOptions.push({
        value: id,
        label: id,
      });
    });
  }

  let urlHelp = '';
  let slugError = '';
  if (rootCollection?.url) {
    if (slug) {
      const cleanSlug = normalizeSlug(slug);
      const slugRegex = rootCollection?.slugRegex;
      if (isSlugValid(cleanSlug, slugRegex)) {
        urlHelp = getDocServingUrl({
          collectionId: collectionId,
          slug: cleanSlug,
        });
      } else {
        slugError = getSlugError(cleanSlug, slugRegex);
      }
    } else {
      urlHelp = getDocServingUrl({
        collectionId: collectionId,
        slug: '[slug]',
      });
    }

    // Rename `/index`, e.g.:
    // ```
    // https://example.com/index -> https://example.com/
    // https://example.com/foo/index -> https://example.com/foo/
    // ```
    if (urlHelp.endsWith('/index')) {
      urlHelp = urlHelp.replace(/\/index$/, '/');
    }
  }

  function onCollectionChange(newCollectionId: string) {
    setCollectionId(newCollectionId);
    if (props.onChange) {
      props.onChange({collectionId: newCollectionId, slug: slug});
    }
  }

  function onSlugChange(newSlug: string) {
    setSlug(newSlug);
    if (props.onChange) {
      props.onChange({collectionId: collectionId, slug: newSlug});
    }
  }

  return (
    <div className={cn('SlugInput', props.className)}>
      <div className="SlugInput__inputs flex items-center gap-2">
        <Select
          className="SlugInput__collection w-2/5 shrink-0"
          aria-label="Collection"
          placeholder="Collection"
          data={collectionOptions}
          onValueChange={(newValue) => onCollectionChange(newValue || '')}
          value={collectionId}
          disabled={!!props.collectionDisabled}
        />
        <div className="SlugInput__divider text-base text-muted">/</div>
        <TextInput
          className="SlugInput__slug min-w-0 flex-1"
          aria-label="Slug"
          name="slug"
          ref={slugRef}
          value={slug}
          onInput={(event) => {
            onSlugChange(event.currentTarget.value);
          }}
          placeholder="slug"
          autoComplete="off"
        />
      </div>
      {urlHelp && (
        <Text className="SlugInput__urlHelp mt-2 break-all" size="body-sm">
          URL: {urlHelp}
        </Text>
      )}
      {slugError && (
        <Text className="SlugInput__slugError mt-2 text-danger" size="body-sm">
          {slugError}
        </Text>
      )}
    </div>
  );
}
