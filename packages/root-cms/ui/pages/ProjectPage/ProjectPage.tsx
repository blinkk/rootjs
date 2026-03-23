import {Button} from '@mantine/core';
import {ActionLogs} from '../../components/ActionLogs/ActionLogs.js';
import {CollectionTree} from '../../components/CollectionTree/CollectionTree.js';
import {Heading} from '../../components/Heading/Heading.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import './ProjectPage.css';

export function ProjectPage() {
  const projectName = window.__ROOT_CTX.rootConfig.projectName || 'Root CMS';
  usePageTitle('Home');
  return (
    <Layout>
      <div className="ProjectPage">
        <div className="ProjectPage__headline">
          <Heading className="ProjectPage__title" size="h1">
            {projectName}
          </Heading>
        </div>

        <div className="ProjectPage__section">
          <Heading className="ProjectPage__section__title" size="h2">
            Content
          </Heading>
          <ProjectPage.CollectionList />
        </div>

        <div className="ProjectPage__section">
          <Heading
            className="ProjectPage__section__title ProjectPage__section__title--flex"
            size="h2"
          >
            <div>Recent actions</div>
            <div>
              <Button
                component="a"
                variant="default"
                size="xs"
                compact
                href="/cms/logs"
              >
                Show all
              </Button>
            </div>
          </Heading>
          <ActionLogs limit={20} compact />
        </div>
      </div>
    </Layout>
  );
}

ProjectPage.CollectionList = () => {
  const collections = window.__ROOT_CTX.collections;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;

  return (
    <div className="ProjectPage__collectionTree">
      <CollectionTree collections={collections} projectId={projectId} />
    </div>
  );
};
