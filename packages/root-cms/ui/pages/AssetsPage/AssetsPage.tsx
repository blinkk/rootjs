import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './AssetsPage.css';

export function AssetsPage() {
  return (
    <Layout>
      <div className="AssetsPage">
        <Heading size="h1">Assets</Heading>
        <Text as="p">
          This page is currently under construction, but the current idea is to
          have this page be used to synchronize image assets from places like
          Figma and Drive and store them in a GCS bucket, organized by folders.
          A content editor can then choose from an image within the asset
          manager or uploading new images when editing image fields in the CMS.
        </Text>
      </div>
    </Layout>
  );
}
