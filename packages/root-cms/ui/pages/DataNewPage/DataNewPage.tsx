import {Breadcrumbs} from '@mantine/core';
import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import './DataNewPage.css';

export function DataNewPage() {
  return (
    <Layout>
      <div className="DataNewPage">
        <div className="DataNewPage__header">
          <Breadcrumbs className="DataNewPage__header__breadcrumbs">
            <a href="/cms/data">Data Sources</a>
            <div>New</div>
          </Breadcrumbs>
          <Heading size="h1">Add data source</Heading>
        </div>
      </div>
    </Layout>
  );
}
