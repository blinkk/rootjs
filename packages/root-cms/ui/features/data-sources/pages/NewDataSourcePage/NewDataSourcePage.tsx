import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';

export function NewDataSourcePage() {
  usePageTitle('New Data Source');
  return (
    <Layout>
      <div className="NewDataSourcePage p-(--cms-page-padding-mobile) md:px-15 md:pb-15 md:pt-12">
        <div className="NewDataSourcePage__header mb-5 max-w-150">
          <Breadcrumbs
            className="NewDataSourcePage__header__breadcrumbs mb-3"
            items={[{label: 'Data Sources', href: '/cms/data'}, {label: 'New'}]}
          />
          <Heading size="h1">Add Data Source</Heading>
        </div>
        <DataSourceForm buttonLabel="Create data source" />
      </div>
    </Layout>
  );
}
