import {IconFolder, IconNotebook} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {Button, Select, Tabs} from '@mantine/core';
import {Markdown} from '../../components/Markdown/Markdown.js';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {Layout} from '../../layout/Layout.js';
import './CollectionPage.css';
import {joinClassNames} from '../../utils/classes.js';
import {useLocalStorage} from '@mantine/hooks';
import {NewDocModal} from '../../components/NewDocModal/NewDocModal.js';

interface CollectionPageProps {
  collection?: string;
}

export function CollectionPage(props: CollectionPageProps) {
  const [query, setQuery] = useState('');

  const collections = window.__ROOT_CTX.collections || [];
  const matchedCollections = collections.filter((c) => {
    if (!query) {
      return true;
    }
    return c.name.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <Layout>
      <SplitPanel className="CollectionPage" localStorageId="CollectionPage">
        <SplitPanel.Item className="CollectionPage__side">
          <div className="CollectionPage__side__title">Collections</div>
          <div className="CollectionPage__side__search">
            <input
              type="text"
              placeholder="Search"
              onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="CollectionPage__side__collections">
            {matchedCollections.map((collection) => (
              <a
                className={joinClassNames(
                  'CollectionPage__side__collection',
                  collection.name === props.collection && 'active'
                )}
                href={`/cms/content/${collection.name}`}
                key={collection.name}
              >
                <div className="CollectionPage__side__collection__icon">
                  <IconFolder size={20} strokeWidth="1.75" />
                </div>
                <div className="CollectionPage__side__collection__name">
                  {collection.name}
                </div>
                {/* {collection.name === props.collection && (
                  <div className="CollectionPage__side__collection__arrow">
                    <IconArrowBigRight strokeWidth={1.5} size={20} />
                  </div>
                )} */}
              </a>
            ))}
            {matchedCollections.length === 0 && (
              <div className="CollectionPage__side__collections__empty">
                No collections match your query.
              </div>
            )}
          </div>
        </SplitPanel.Item>
        <SplitPanel.Item className="CollectionPage__main" fluid>
          {props.collection ? (
            <CollectionPage.Collection
              key={props.collection}
              collection={props.collection}
            />
          ) : (
            <div className="CollectionPage__main__unselected">
              <div className="CollectionPage__main__unselected__title">
                Select a collection to get started.
              </div>
            </div>
          )}
        </SplitPanel.Item>
      </SplitPanel>
    </Layout>
  );
}

interface CollectionProps {
  collection: string;
}

CollectionPage.Collection = (props: CollectionProps) => {
  const [sortBy, setSortBy] = useLocalStorage<string>({
    key: `root::CollectionPage:${props.collection}:sort`,
    defaultValue: 'modifiedAt',
  });

  const [newDocModalOpen, setNewDocModalOpen] = useState(false);

  const collections = window.__ROOT_CTX.collections || [];
  const collection = collections.find((c) => c.name === props.collection);
  if (!collection) {
    return (
      <div className="CollectionPage__collection">
        <div className="CollectionPage__collection__notFound">
          Could not find collection: {props.collection}
        </div>
      </div>
    );
  }
  return (
    <>
      <NewDocModal
        collection={props.collection}
        opened={newDocModalOpen}
        onClose={() => setNewDocModalOpen(false)}
      />
      <div className="CollectionPage__collection">
        <div className="CollectionPage__collection__header">
          <div className="CollectionPage__collection__header__title">
            {collection.name}
          </div>
          {collection.description && (
            <Markdown
              className="CollectionPage__collection__header__description"
              code={collection.description}
            />
          )}
        </div>
        <Tabs className="CollectionPage__collection__tabs" value="docs">
          <Tabs.List>
            <Tabs.Tab value="docs" icon={<IconNotebook size={18} />}>
              Docs
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel
            value="docs"
            className="CollectionPage__collection__docsTab"
          >
            <div className="CollectionPage__collection__docsTab__controls">
              <div className="CollectionPage__collection__docsTab__controls__sort">
                <div className="CollectionPage__collection__docsTab__controls__sort__label">
                  Sort:
                </div>
                <Select
                  size="xs"
                  value={sortBy}
                  onChange={(value) => setSortBy(value || 'modifiedAt')}
                  data={[
                    {value: 'slug', label: 'A-Z'},
                    {value: 'modifiedAt', label: 'Last modified'},
                  ]}
                />
              </div>
              <div className="CollectionPage__collection__docsTab__controls__newDoc">
                <Button
                  color="cyan"
                  size="xs"
                  onClick={() => setNewDocModalOpen(true)}
                >
                  New doc
                </Button>
              </div>
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </>
  );
};
