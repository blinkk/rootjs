import './AssetBrowser.css';

import {Button, Loader, TextInput} from '@mantine/core';
import {IconFolder, IconFolderPlus, IconSearch} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Asset, AssetFolder, normalizeAssetDir} from '../../../shared/asset.js';
import {
  assetsCreateFolder,
  listAssetFolders,
  listAssets,
} from '../../utils/assets.js';
import {joinClassNames} from '../../utils/classes.js';
import {getFileExt, testIsImageFile} from '../../utils/gcs.js';
import {notifyErrors} from '../../utils/notifications.js';

export interface AssetBrowserProps {
  /** Current folder path being viewed. */
  currentDir: string;
  /** Called when the user navigates into a folder (or breadcrumb). */
  onNavigate: (dir: string) => void;
  /** Called when an asset is clicked. */
  onSelect: (asset: Asset) => void;
  /** Restrict displayed assets to these file exts/mimetypes (picker mode). */
  accept?: string[];
  /** Currently highlighted asset id, if any. */
  selectedAssetId?: string;
  /** Bump to force a reload (e.g. after upload/replace). */
  refreshKey?: number;
  /** Whether to show the "New folder" control. */
  allowCreateFolder?: boolean;
}

function dirSegments(dir: string): Array<{name: string; path: string}> {
  const normalized = normalizeAssetDir(dir);
  if (normalized === '/') {
    return [];
  }
  const parts = normalized.slice(1).split('/');
  const segments: Array<{name: string; path: string}> = [];
  let path = '';
  for (const part of parts) {
    path = `${path}/${part}`;
    segments.push({name: part, path});
  }
  return segments;
}

function assetMatchesAccept(asset: Asset, accept?: string[]): boolean {
  if (!accept || accept.length === 0) {
    return true;
  }
  if (accept.includes('*/*') || accept.includes('*')) {
    return true;
  }
  // If the picker only wants images, filter to image assets.
  const wantsImagesOnly = accept.every((t) => t.startsWith('image/'));
  if (wantsImagesOnly) {
    return testIsImageFile(asset.filename || asset.src);
  }
  const ext = getFileExt(asset.filename || asset.src);
  return accept.some((t) => t.replace(/^\./, '').toLowerCase() === ext);
}

export function AssetBrowser(props: AssetBrowserProps) {
  const {currentDir, onNavigate, onSelect} = props;
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [query, setQuery] = useState('');

  async function reload() {
    setLoading(true);
    await notifyErrors(async () => {
      const [assetList, folderList] = await Promise.all([
        listAssets(currentDir),
        listAssetFolders(currentDir),
      ]);
      setAssets(assetList);
      setFolders(folderList);
    });
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, [currentDir, props.refreshKey]);

  const visibleAssets = useMemo(() => {
    const search = query.trim().toLowerCase();
    return assets
      .filter((asset) => assetMatchesAccept(asset, props.accept))
      .filter((asset) =>
        search ? (asset.filename || '').toLowerCase().includes(search) : true
      );
  }, [assets, query, props.accept]);

  const segments = dirSegments(currentDir);

  async function handleNewFolder() {
    const name = window.prompt('New folder name:');
    if (!name) {
      return;
    }
    await notifyErrors(async () => {
      await assetsCreateFolder(name, currentDir);
      await reload();
    });
  }

  return (
    <div className="AssetBrowser">
      <div className="AssetBrowser__toolbar">
        <div className="AssetBrowser__breadcrumbs">
          <button
            className="AssetBrowser__crumb"
            onClick={() => onNavigate('/')}
            type="button"
          >
            Assets
          </button>
          {segments.map((segment) => (
            <span key={segment.path}>
              <span className="AssetBrowser__crumbSep">/</span>
              <button
                className="AssetBrowser__crumb"
                onClick={() => onNavigate(segment.path)}
                type="button"
              >
                {segment.name}
              </button>
            </span>
          ))}
        </div>
        <div className="AssetBrowser__actions">
          <TextInput
            size="xs"
            placeholder="Search files"
            icon={<IconSearch size={14} />}
            value={query}
            onChange={(e: any) => setQuery(e.currentTarget.value)}
          />
          {props.allowCreateFolder && (
            <Button
              size="xs"
              variant="default"
              leftIcon={<IconFolderPlus size={14} />}
              onClick={handleNewFolder}
            >
              New folder
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="AssetBrowser__loading">
          <Loader size="sm" />
        </div>
      ) : (
        <div className="AssetBrowser__grid">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="AssetBrowser__tile AssetBrowser__tile--folder"
              onDblClick={() => onNavigate(folder.path)}
              onClick={() => onNavigate(folder.path)}
              title={folder.path}
            >
              <IconFolder size={40} />
              <div className="AssetBrowser__tile__label">{folder.name}</div>
            </button>
          ))}
          {visibleAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={joinClassNames(
                'AssetBrowser__tile AssetBrowser__tile--asset',
                props.selectedAssetId === asset.id && 'selected'
              )}
              onClick={() => onSelect(asset)}
              title={asset.filename || asset.src}
            >
              <div className="AssetBrowser__tile__thumb">
                {testIsImageFile(asset.filename || asset.src) ? (
                  <img src={asset.src} alt={asset.alt || ''} loading="lazy" />
                ) : (
                  <div className="AssetBrowser__tile__fileExt">
                    {getFileExt(asset.filename || asset.src) || 'file'}
                  </div>
                )}
              </div>
              <div className="AssetBrowser__tile__label">
                {asset.filename || asset.id}
              </div>
            </button>
          ))}
          {folders.length === 0 && visibleAssets.length === 0 && (
            <div className="AssetBrowser__empty">This folder is empty.</div>
          )}
        </div>
      )}
    </div>
  );
}
