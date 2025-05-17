import {Select, TextInput} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import {useRef, useState} from 'preact/hooks';
import {isSlugValid, normalizeSlug} from '../../../shared/slug.js';
import {Text} from '../../components/Text/Text.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import './SlugInput.css';

export interface SlugInputProps {
  className?: string;
  collectionId?: string;
  collectionDisabled?: boolean;
  onChange?: (newValue: {collectionId: string; slug: string}) => void;
}

export function SlugInput(props: SlugInputProps) {
  const [collectionId, setCollectionId] = useState(props.collectionId || '');
  const slugRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState('');

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
        urlHelp = 'INVALID SLUG';
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
    <div className={joinClassNames(props.className, 'SlugInput')}>
      <div className="SlugInput__inputs">
        <Select
          className="SlugInput__collection"
          placeholder="Collection"
          size="xs"
          data={collectionOptions}
          onChange={(newValue: string) => onCollectionChange(newValue)}
          value={collectionId}
          disabled={!!props.collectionDisabled}
        />
        <div className="SlugInput__divider">/</div>
        <TextInput
          className="SlugInput__slug"
          name="slug"
          ref={slugRef}
          value={slug}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onSlugChange(event.currentTarget.value);
          }}
          placeholder="slug"
          autoComplete="off"
          size="xs"
        />
      </div>
      {urlHelp && (
        <Text className="SlugInput__urlHelp" size="body-sm">
          {urlHelp}
        </Text>
      )}
    </div>
  );
}
