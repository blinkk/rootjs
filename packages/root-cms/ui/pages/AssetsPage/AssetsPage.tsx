import './AssetsPage.css';

import {ActionIcon, Button, Loader, Textarea, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconCopy,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUpload,
} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {Asset, normalizeAssetDir} from '../../../shared/asset.js';
import {AssetBrowser} from '../../components/AssetBrowser/AssetBrowser.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Surface} from '../../components/Surface/Surface.js';
import {Text} from '../../components/Text/Text.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {
  AssetUsage,
  assetsCreate,
  assetsDelete,
  assetsMove,
  assetsRebuildUsages,
  assetsRename,
  assetsReplace,
  assetsSetAlt,
  getAssetUsages,
} from '../../utils/assets.js';
import {testIsImageFile, uploadFileToGCS} from '../../utils/gcs.js';
import {notifyErrors} from '../../utils/notifications.js';

export function AssetsPage() {
  usePageTitle('Assets');
  const [currentDir, setCurrentDir] = useState('/');
  const [selected, setSelected] = useState<Asset | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    setBusy(true);
    await notifyErrors(async () => {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFileToGCS(file);
        await assetsCreate(uploaded, currentDir);
      }
      refresh();
      showNotification({message: 'Uploaded to library', color: 'green'});
    });
    setBusy(false);
  }

  async function handleReplaceFile(files: FileList | null) {
    if (!files || files.length === 0 || !selected) {
      return;
    }
    setBusy(true);
    await notifyErrors(async () => {
      const uploaded = await uploadFileToGCS(files[0]);
      const result = await assetsReplace(selected.id, uploaded);
      setSelected(result.asset);
      refresh();
      showNotification({
        message: `Replaced — updated ${result.docsUpdated} draft doc(s)`,
        color: 'green',
      });
    });
    setBusy(false);
  }

  return (
    <Layout>
      <div className="AssetsPage" data-testid="assets-page">
        <div className="AssetsPage__header">
          <Heading size="h1">Assets</Heading>
          <Text as="p">Browse and manage the project's asset library.</Text>
        </div>
        <div className="AssetsPage__body">
          <Surface className="AssetsPage__browser">
            <div className="AssetsPage__browser__toolbar">
              <Button
                leftIcon={<IconUpload size={16} />}
                loading={busy}
                onClick={() => uploadInputRef.current?.click()}
              >
                Upload to this folder
              </Button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                style={{display: 'none'}}
                onChange={(e: any) => {
                  handleUploadFiles(e.currentTarget.files);
                  e.currentTarget.value = '';
                }}
              />
            </div>
            <AssetBrowser
              currentDir={currentDir}
              onNavigate={(dir) => {
                setCurrentDir(dir);
                setSelected(null);
              }}
              onSelect={(asset) => setSelected(asset)}
              selectedAssetId={selected?.id}
              refreshKey={refreshKey}
              allowCreateFolder
            />
          </Surface>
          {selected && (
            <AssetDetail
              asset={selected}
              busy={busy}
              onReplace={() => replaceInputRef.current?.click()}
              onChanged={(a) => {
                setSelected(a);
                refresh();
              }}
              onDeleted={() => {
                setSelected(null);
                refresh();
              }}
            />
          )}
          <input
            ref={replaceInputRef}
            type="file"
            style={{display: 'none'}}
            onChange={(e: any) => {
              handleReplaceFile(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
        </div>
        <div className="AssetsPage__footer">
          <Button
            variant="subtle"
            size="xs"
            leftIcon={<IconRefresh size={14} />}
            onClick={() =>
              notifyErrors(async () => {
                const res = await assetsRebuildUsages();
                showNotification({
                  message: `Rebuilt usages: scanned ${res.docsScanned} docs, ${res.usages} usages`,
                  color: 'green',
                });
              })
            }
          >
            Rebuild usage index (admin)
          </Button>
        </div>
      </div>
    </Layout>
  );
}

interface AssetDetailProps {
  asset: Asset;
  busy: boolean;
  onReplace: () => void;
  onChanged: (asset: Asset) => void;
  onDeleted: () => void;
}

function AssetDetail(props: AssetDetailProps) {
  const {asset} = props;
  const [alt, setAlt] = useState(asset.alt || '');
  const [usages, setUsages] = useState<AssetUsage[] | null>(null);

  useEffect(() => {
    setAlt(asset.alt || '');
    setUsages(null);
    getAssetUsages(asset.id)
      .then(setUsages)
      .catch(() => setUsages([]));
  }, [asset.id, asset.version]);

  async function saveAlt() {
    await notifyErrors(async () => {
      const result = await assetsSetAlt(asset.id, alt);
      props.onChanged(result.asset);
      showNotification({
        message: `Alt updated — ${result.docsUpdated} draft doc(s)`,
        color: 'green',
      });
    });
  }

  async function rename() {
    const filename = window.prompt('Rename file:', asset.filename || '');
    if (!filename) {
      return;
    }
    await notifyErrors(async () => {
      await assetsRename(asset.id, filename);
      props.onChanged({...asset, filename});
    });
  }

  async function move() {
    const dir = window.prompt('Move to folder (e.g. /logos):', asset.dir || '/');
    if (dir === null) {
      return;
    }
    await notifyErrors(async () => {
      await assetsMove(asset.id, dir);
      props.onChanged({...asset, dir: normalizeAssetDir(dir)});
    });
  }

  async function remove() {
    const count = usages?.length ?? 0;
    const message =
      count > 0
        ? `This asset is used by ${count} doc(s). Force delete anyway?`
        : 'Delete this asset?';
    if (!window.confirm(message)) {
      return;
    }
    await notifyErrors(async () => {
      await assetsDelete(asset.id, count > 0);
      props.onDeleted();
    });
  }

  return (
    <Surface className="AssetsPage__detail">
      <div className="AssetsPage__detail__preview">
        {testIsImageFile(asset.filename || asset.src) ? (
          <img src={asset.src} alt={asset.alt || ''} />
        ) : (
          <div className="AssetsPage__detail__fileIcon">
            {asset.filename || asset.id}
          </div>
        )}
      </div>
      <div className="AssetsPage__detail__name">
        <span>{asset.filename || asset.id}</span>
        <ActionIcon size="sm" onClick={rename} title="Rename">
          <IconPencil size={14} />
        </ActionIcon>
      </div>
      <div className="AssetsPage__detail__meta">
        <div>Version: v{asset.version}</div>
        <div>Folder: {asset.dir || '/'}</div>
        {!!asset.width && !!asset.height && (
          <div>
            Dimensions: {asset.width}×{asset.height}
          </div>
        )}
      </div>
      <div className="AssetsPage__detail__url">
        <Textarea value={asset.src} readOnly autosize minRows={1} size="xs" />
        <Tooltip label="Copy URL">
          <ActionIcon
            onClick={() => navigator.clipboard.writeText(asset.src)}
            title="Copy URL"
          >
            <IconCopy size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
      <div className="AssetsPage__detail__alt">
        <Textarea
          label="Alt text (applies to every use)"
          value={alt}
          onChange={(e: any) => setAlt(e.currentTarget.value)}
          autosize
          minRows={2}
          size="xs"
        />
        <Button
          size="xs"
          variant="default"
          onClick={saveAlt}
          disabled={alt === (asset.alt || '')}
        >
          Save alt text
        </Button>
      </div>
      <div className="AssetsPage__detail__usages">
        {usages === null ? (
          <Loader size="xs" />
        ) : (
          <div className="AssetsPage__detail__usages__count">
            Used in {usages.length} doc(s)
          </div>
        )}
        {usages && usages.length > 0 && (
          <ul className="AssetsPage__detail__usages__list">
            {usages.slice(0, 20).map((u) => (
              <li key={u.docId}>{u.docId}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="AssetsPage__detail__actions">
        <Button
          size="xs"
          leftIcon={<IconUpload size={14} />}
          loading={props.busy}
          onClick={props.onReplace}
        >
          Replace file
        </Button>
        <Button size="xs" variant="default" onClick={move}>
          Move
        </Button>
        <Button
          size="xs"
          color="red"
          variant="outline"
          leftIcon={<IconTrash size={14} />}
          onClick={remove}
        >
          Delete
        </Button>
      </div>
    </Surface>
  );
}
