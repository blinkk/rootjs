import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './DataPage.css';

export function DataPage() {
  return (
    <Layout>
      <div className="DataPage">
        <Heading size="h1">Data</Heading>
        <Text as="p">
          This page is currently under construction, but the current idea is to
          have this page be used to synchronize large batches of data that may
          not fit in a normal CMS doc, such as a large number of pins for a map.
        </Text>
        <Text as="p">
          The first iteration of this page will only support syncing data from
          Google Sheets. As time goes on, we may add other data providers in
          either a columnar layout or JSON-style data. An API would be available
          to developers, either using a JSON-RPC style endpoint or something
          like GraphQL.
        </Text>
      </div>
    </Layout>
  );
}
