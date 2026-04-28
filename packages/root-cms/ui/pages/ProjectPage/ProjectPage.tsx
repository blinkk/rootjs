import './ProjectPage.css';

import {Button} from '@mantine/core';
import {ComponentChildren} from 'preact';
import {ActionLogs} from '../../components/ActionLogs/ActionLogs.js';
import {CollectionTree} from '../../components/CollectionTree/CollectionTree.js';
import {Surface} from '../../components/Surface/Surface.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';

export function ProjectPage() {
  // const projectName = window.__ROOT_CTX.rootConfig.projectName || 'Root CMS';
  usePageTitle('Home');
  return (
    <Layout>
      <div className="ProjectPage">
        <div className="ProjectPage__section">
          <ProjectPage.Collections />
          <ProjectPage.ActionLogs />
        </div>
      </div>
    </Layout>
  );
}

interface SectionTitleProps {
  className?: string;
  children?: ComponentChildren;
}

ProjectPage.SectionTitle = (props: SectionTitleProps) => {
  return <div className="ProjectPage__sectionTitle">{props.children}</div>;
};

ProjectPage.Collections = () => {
  const collections = window.__ROOT_CTX.collections;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;

  return (
    <div className="ProjectPage__collections">
      {/* <ProjectPage.SectionTitle>Content</ProjectPage.SectionTitle> */}
      <CollectionTree collections={collections} projectId={projectId} />
    </div>
  );
};

ProjectPage.ActionLogs = () => {
  return (
    <div className="ProjectPage__actionLogs">
      <div className="ProjectPage__actionLogs__header">
        <ProjectPage.SectionTitle>Recent actions</ProjectPage.SectionTitle>
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
      <Surface>
        <ActionLogs limit={10} compact />
      </Surface>
    </div>
  );
};
