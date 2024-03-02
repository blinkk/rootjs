import {Breadcrumbs} from '@mantine/core';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import './EditDataSourcePage.css';

export function EditDataSourcePage(props: {id: string}) {
  return (
    <Layout>
      <div className="EditDataSourcePage">
        <div className="EditDataSourcePage__header">
          <Breadcrumbs className="EditDataSourcePage__header__breadcrumbs">
            <a href="/cms/data">Data Sources</a>
            <a href={`/cms/data/${props.id}`}>{props.id}</a>
            <div>Edit</div>
          </Breadcrumbs>
          <Heading size="h1">Edit data source: {props.id}</Heading>
        </div>
        <DataSourceForm dataSourceId={props.id} />
      </div>
    </Layout>
  );
}
