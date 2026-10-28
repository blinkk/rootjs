import {defineGallery} from '../../dev/gallery/types.js';
import {Badge} from '../Badge/Badge.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from './Table.js';

const DOCS = [
  {
    id: 'pages/index',
    status: 'Published',
    modified: 'Oct 21, 2026',
    by: 'ada@example.com',
  },
  {
    id: 'pages/about',
    status: 'Draft',
    modified: 'Oct 22, 2026',
    by: 'grace@example.com',
  },
  {
    id: 'pages/pricing',
    status: 'Scheduled',
    modified: 'Oct 24, 2026',
    by: 'margaret@example.com',
  },
  {
    id: 'blog/hello-world',
    status: 'Published',
    modified: 'Oct 25, 2026',
    by: 'alan@example.com',
  },
];

const TONES = {
  Published: 'success',
  Draft: 'neutral',
  Scheduled: 'info',
} as const;

function DocsTable(props: {
  dense?: boolean;
  striped?: boolean;
  hover?: boolean;
  stickyFirstColumn?: boolean;
  label?: string;
}) {
  return (
    <Table {...props}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Document</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Last modified</TableHeaderCell>
          <TableHeaderCell>Modified by</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {DOCS.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell className="whitespace-nowrap font-medium">
              {doc.id}
            </TableCell>
            <TableCell>
              <Badge size="xs" tone={TONES[doc.status as keyof typeof TONES]}>
                {doc.status}
              </Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap">{doc.modified}</TableCell>
            <TableCell className="whitespace-nowrap">{doc.by}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export const TableGallery = defineGallery({
  id: 'table',
  name: 'Table',
  group: 'Primitives',
  stories: {
    Default: () => <DocsTable label="Documents" />,
    'Dense, striped, hover': () => (
      <DocsTable dense striped hover label="Documents (dense)" />
    ),
    'Sticky first column': () => (
      <DocsTable stickyFirstColumn hover label="Documents (sticky)" />
    ),
    'Key/value details': () => (
      <Table dense className="max-w-sm" label="File details">
        <TableBody>
          <TableRow>
            <TableHeaderCell>Dimensions</TableHeaderCell>
            <TableCell>1920 × 1080</TableCell>
          </TableRow>
          <TableRow>
            <TableHeaderCell>Size</TableHeaderCell>
            <TableCell>240 KB</TableCell>
          </TableRow>
          <TableRow>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableCell>image/jpeg</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    ),
  },
});
