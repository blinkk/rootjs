import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Pagination} from './Pagination.js';

function Demo(props: {total: number; initialPage: number}) {
  const [page, setPage] = useState(props.initialPage);
  return <Pagination total={props.total} page={page} onChange={setPage} />;
}

export const PaginationGallery = defineGallery({
  id: 'pagination',
  name: 'Pagination',
  group: 'Primitives',
  stories: {
    'Few pages': () => <Demo total={4} initialPage={2} />,
    'First page': () => <Demo total={20} initialPage={1} />,
    'Middle page': () => <Demo total={20} initialPage={10} />,
    'Last page': () => <Demo total={20} initialPage={20} />,
    'Large page numbers': () => <Demo total={1250} initialPage={624} />,
  },
});
