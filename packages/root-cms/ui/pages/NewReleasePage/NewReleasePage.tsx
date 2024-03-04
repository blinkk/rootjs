import {Breadcrumbs} from '@mantine/core';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseForm} from '../../components/ReleaseForm/ReleaseForm.js';
import {Layout} from '../../layout/Layout.js';
import './NewReleasePage.css';

export function NewReleasePage() {
  return (
    <Layout>
      <div className="NewReleasePage">
        <div className="NewReleasePage__header">
          <Breadcrumbs className="NewReleasePage__header__breadcrumbs">
            <a href="/cms/releases">Releases</a>
            <div>New</div>
          </Breadcrumbs>
          <Heading size="h1">Add Release</Heading>
        </div>
        <ReleaseForm buttonLabel="Add release" />
      </div>
    </Layout>
  );
}
