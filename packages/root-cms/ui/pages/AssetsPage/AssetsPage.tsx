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
 * The asset library page. Provides a Drive-like interface for uploading and
 * organizing the project's assets. Assets can be selected from image/file
 * fields in the doc editor, and updates to an asset fan out to all draft docs
 * that use it.
 */
export function AssetsPage() {
  usePageTitle('Asset Library');
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
          <Heading size="h1">Asset Library</Heading>
          <Text as="p">
            The asset library can be used to store and organize files used
            throughout the project. Replacing a file in the asset library
            automatically updates all draft docs that use it (requires
            re-publishing).
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
