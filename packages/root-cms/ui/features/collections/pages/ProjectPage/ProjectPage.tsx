import {ComponentChildren} from 'preact';
import {Layout} from '../../../../app/layout/Layout.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {useBooleanParam} from '../../../../hooks/useQueryParam.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {ActionLogs} from '../../../logs/components/ActionLogs/ActionLogs.js';
import {CollectionTree} from '../../components/CollectionTree/CollectionTree.js';

export function ProjectPage() {
  // const projectName = window.__ROOT_CTX.rootConfig.projectName || 'Root CMS';
  usePageTitle('Home');
  return (
    <Layout>
      <div className="ProjectPage bg-page p-page">
        <div className="ProjectPage__main flex max-w-320 flex-col gap-7">
          {/*
           * The collections column (370px, then a 32px gap) matches the
           * collection list on the collection page; the action logs take the
           * rest.
           */}
          <div className="ProjectPage__section flex flex-col gap-6 lg:flex-row lg:gap-8">
            <ProjectPage.Collections />
            <ProjectPage.ActionLogs />
          </div>
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
  return (
    <div className="ProjectPage__sectionTitle inline-block text-base font-semibold leading-tight">
      {props.children}
    </div>
  );
};

ProjectPage.Collections = () => {
  const collections = window.__ROOT_CTX.collections;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;

  return (
    <div className="ProjectPage__collections min-w-0 lg:w-92.5 lg:shrink-0">
      {/* <ProjectPage.SectionTitle>Content</ProjectPage.SectionTitle> */}
      <CollectionTree collections={collections} projectId={projectId} />
    </div>
  );
};

ProjectPage.ActionLogs = () => {
  // Use `?welcome=true` to show the onboarding message, e.g. for testing or
  // when linking new users to the CMS.
  const [showOnboarding] = useBooleanParam('welcome');
  return (
    <div className="ProjectPage__actionLogs min-w-0 flex-1">
      <div className="ProjectPage__actionLogs__header mb-3 flex items-center justify-between gap-3">
        <ProjectPage.SectionTitle>Recent actions</ProjectPage.SectionTitle>
        <Button size="xs" href="/cms/logs">
          Show all
        </Button>
      </div>
      <Surface>
        <ActionLogs limit={10} compact showOnboarding={showOnboarding} />
      </Surface>
    </div>
  );
};
