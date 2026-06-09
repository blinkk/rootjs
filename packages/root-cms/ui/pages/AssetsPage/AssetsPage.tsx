import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {AssetBrowser} from '../../components/AssetBrowser/AssetBrowser.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useQueryParam} from '../../hooks/useQueryParam.js';
import {Layout} from '../../layout/Layout.js';
import './AssetsPage.css';

/**
 * The asset manager page. Provides a Drive-like interface for uploading and
 * organizing the project's assets. Assets can be selected from image/file
 * fields in the doc editor, and updates to an asset fan out to all draft docs
 * that use it.
 */
export function AssetsPage() {
  usePageTitle('Assets');
  const [folder, setFolder] = useQueryParam('folder', '');
  // One-shot deep link used to auto-open an asset's details modal, e.g.
  // `?asset=<id>`. The param is consumed (removed from the URL) on load.
  const {query, route} = useLocation();
  const [initialAssetId] = useState((query.asset as string) || '');
  useEffect(() => {
    if (initialAssetId) {
      const url = new URL(window.location.href);
      url.searchParams.delete('asset');
      route(url.pathname + url.search, true);
    }
  }, []);

  return (
    <Layout>
      <div className="AssetsPage" data-testid="assets-page">
        <div className="AssetsPage__header">
          <Heading size="h1">Assets</Heading>
          <Text as="p">
            Upload and organize the project's assets. Files can be selected from
            image and file fields in the doc editor; replacing a file or
            updating its alt text automatically updates all draft docs that use
            it.
          </Text>
        </div>
        <AssetBrowser
          className="AssetsPage__browser"
          mode="manage"
          folder={folder}
          onFolderChange={setFolder}
          initialAssetId={initialAssetId}
        />
      </div>
    </Layout>
  );
}
