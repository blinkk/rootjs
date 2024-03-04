import {IconFolder} from '@tabler/icons-preact';

import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import './ProjectPage.css';

export function ProjectPage() {
  const projectName = window.__ROOT_CTX.rootConfig.projectName || 'Root CMS';
  return (
    <Layout>
      <div className="ProjectPage">
        <Heading size="h1">{projectName}</Heading>

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
