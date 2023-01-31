import {IconFolder} from '@tabler/icons-preact';
import './CollectionList.css';

interface CollectionListProps {
  selected?: string;
}

export function CollectionList(props: CollectionListProps) {
  const collections = window.__ROOT_CTX?.collections || [];
  return (
    <div className="CollectionList">
      <div className="CollectionList__search">
        <input type="text" placeholder="Filter collections" />
      </div>
      <div className="CollectionList__collections">
        {collections.map((collection) => (
          <div className="CollectionList__collection" key={collection.name}>
            <a href={`/cms/content/${collection.name}`}>
              <div className="CollectionList__collection__icon">
                <IconFolder stroke="1.75" size={20} />
              </div>
              <div className="CollectionList__collection__name">
                {collection.name}
              </div>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
