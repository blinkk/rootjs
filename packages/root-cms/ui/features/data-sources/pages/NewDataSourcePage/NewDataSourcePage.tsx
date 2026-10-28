import {Breadcrumbs} from '@mantine/core';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';
import './NewDataSourcePage.css';

export function NewDataSourcePage() {
  usePageTitle('New Data Source');
  return (
    <Layout>
      <div className="NewDataSourcePage">
        <div className="NewDataSourcePage__header">
          <Breadcrumbs className="NewDataSourcePage__header__breadcrumbs">
            <a href="/cms/data">Data Sources</a>
            <div>New</div>
          </Breadcrumbs>
          <Heading size="h1">Add Data Source</Heading>
        </div>
        <DataSourceForm buttonLabel="Create data source" />
      </div>
    </Layout>
  );
}
