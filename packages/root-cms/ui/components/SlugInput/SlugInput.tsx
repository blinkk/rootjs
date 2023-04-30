import {Select, TextInput} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import {useRef, useState} from 'preact/hooks';
import {Text} from '../../components/Text/Text.js';
import {joinClassNames} from '../../utils/classes.js';
import {isSlugValid, normalizeSlug} from '../../utils/slug.js';
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

  const domain = window.__ROOT_CTX.rootConfig?.domain || 'https://example.com';
  let urlHelp = '';
  if (rootCollection?.url) {
    if (slug) {
      const cleanSlug = normalizeSlug(slug);
      if (isSlugValid(cleanSlug)) {
        const cleanSlugPath = cleanSlug.replaceAll('--', '/');
        let urlPath = rootCollection.url.replace(/\[.*slug\]/, cleanSlugPath);
        // Rename `https://example.com/index` to `https://example.com/`.
        if (urlPath === '/index') {
          urlPath = '/';
        }
        urlHelp = `${domain}${urlPath}`;
      } else {
        urlHelp = 'INVALID SLUG';
      }
    } else {
      urlHelp = `${domain}${rootCollection.url}`;
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
