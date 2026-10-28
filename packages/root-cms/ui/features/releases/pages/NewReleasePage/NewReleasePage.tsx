import {Breadcrumbs} from '@mantine/core';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {ReleaseForm} from '../../components/ReleaseForm/ReleaseForm.js';
import './NewReleasePage.css';

export function NewReleasePage() {
  usePageTitle('New release');
  return (
    <Layout>
      <div className="NewReleasePage">
        <div className="NewReleasePage__header">
          <Breadcrumbs className="NewReleasePage__header__breadcrumbs">
            <a href="/cms/releases">Releases</a>
            <div>New</div>
          </Breadcrumbs>
          <Heading size="h1">New release</Heading>
        </div>
        <Surface className="NewReleasePage__form">
          <ReleaseForm buttonLabel="Create release" />
        </Surface>
      </div>
    </Layout>
  );
}
