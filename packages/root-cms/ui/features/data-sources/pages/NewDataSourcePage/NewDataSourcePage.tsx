import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Text} from '../../../../components/Text/Text.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';

export function NewDataSourcePage() {
  usePageTitle('New Data Source');
  return (
    <Layout>
      <div className="NewDataSourcePage bg-page px-page pt-page">
        <div className="NewDataSourcePage__content max-w-180">
          <div className="NewDataSourcePage__header mb-7">
            <Breadcrumbs
              className="NewDataSourcePage__header__breadcrumbs mb-3"
              items={[
                {label: 'Data Sources', href: '/cms/data'},
                {label: 'New'},
              ]}
            />
            <Heading size="h1">New data source</Heading>
            <Text as="p" color="gray" className="mb-0 mt-2 max-w-prose">
              Connect a Google Sheet or an HTTP endpoint. Once it’s created, you
              can sync the data, review it, and publish it to the site.
            </Text>
          </div>
          <DataSourceForm />
        </div>
      </div>
    </Layout>
  );
}
