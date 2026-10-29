import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {ReleaseForm} from '../../components/ReleaseForm/ReleaseForm.js';

export function NewReleasePage() {
  usePageTitle('New release');
  return (
    <Layout>
      <div className="NewReleasePage bg-page p-page">
        <div className="NewReleasePage__header mb-5 max-w-150">
          <Breadcrumbs
            className="NewReleasePage__breadcrumbs mb-3"
            items={[{label: 'Releases', href: '/cms/releases'}, {label: 'New'}]}
          />
          <Heading size="h1">New release</Heading>
        </div>
        <Surface className="NewReleasePage__form max-w-172 p-4 md:p-5">
          <ReleaseForm buttonLabel="Create release" />
        </Surface>
      </div>
    </Layout>
  );
}
