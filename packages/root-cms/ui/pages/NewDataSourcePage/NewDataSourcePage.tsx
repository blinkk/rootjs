import {Breadcrumbs} from '@mantine/core';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import './NewDataSourcePage.css';

export function NewDataSourcePage() {
  return (
    <Layout>
      <div className="NewDataSourcePage">
        <div className="NewDataSourcePage__header">
          <Breadcrumbs className="NewDataSourcePage__header__breadcrumbs">
            <a href="/cms/data">Data Sources</a>
            <div>New</div>
          </Breadcrumbs>
          <Heading size="h1">Add data source</Heading>
        </div>
        <DataSourceForm buttonLabel="Add data source" />
      </div>
    </Layout>
  );
}
