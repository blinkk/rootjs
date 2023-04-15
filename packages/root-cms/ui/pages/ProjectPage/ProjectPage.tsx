import {IconFolder} from '@tabler/icons-preact';

import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './ProjectPage.css';

export function ProjectPage() {
  return (
    <Layout>
      <div className="ProjectPage">
        <Heading size="h1">Project Home</Heading>
        <Text as="p">
          This page is currently under construction, but the current idea is to
          have collaborative features here, such as a shared whiteboard (e.g.
          Notion style) that can be used to provide an overview of the project,
          timelines and milestones, important links (e.g. Figma), etc.
        </Text>
        <Text as="p">
          There should also be a dashboard here that shows upcoming scheduled
          releases, and maybe common user controls like a share box.
        </Text>

        <div className="ProjectPage__section">
          <Heading className="ProjectPage__section__title" size="h2">
            Content
          </Heading>
          <ProjectPage.CollectionList />
        </div>
      </div>
    </Layout>
  );
}

ProjectPage.CollectionList = () => {
  const collections = Object.keys(window.__ROOT_CTX.collections).map((id) => {
    return {
      ...window.__ROOT_CTX.collections[id],
      id: id,
    };
  });
  return (
    <div className="ProjectPage__collectionList">
      {collections.map((collection) => (
        <a
          className="ProjectPage__collectionList__collection"
          href={`/cms/content/${collection.id}`}
          key={collection.id}
        >
          <div className="ProjectPage__collectionList__collection__icon">
            <IconFolder size={20} strokeWidth="1.75" />
          </div>
          <div className="ProjectPage__collectionList__collection__name">
            {collection.name || collection.id}
          </div>
          <div className="ProjectPage__collectionList__collection__desc">
            {collection.description || ''}
          </div>
        </a>
      ))}
      {collections.length === 0 && (
        <div className="ProjectPage__collectionList__collections__empty">
          No collections match your query.
        </div>
      )}
    </div>
  );
};
