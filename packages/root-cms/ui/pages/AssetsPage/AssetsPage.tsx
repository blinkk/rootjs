import {AssetUploader} from '../../components/AssetUploader/AssetUploader.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './AssetsPage.css';

export function AssetsPage() {
  return (
    <Layout>
      <div className="AssetsPage">
        <div className="AssetsPage__header">
          <Heading size="h1">Assets</Heading>
          <Text as="p">Upload assets to the project's GCS bucket.</Text>
        </div>
        <AssetUploader />
      </div>
    </Layout>
  );
}
