import {cmsRoute} from '@blinkk/root-cms';
import {
  PageModuleFields,
  PageModules,
} from '@/components/PageModules/PageModules.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {PagesDoc} from '@/root-cms.js';

export interface PageProps {
  doc: PagesDoc;
}

export default function Page(props: PageProps) {
  const fields = props.doc.fields || {};
  const title = fields?.meta?.title;
  const description = fields?.meta?.description;
  const image = fields.meta?.image?.src;
  const modules: PageModuleFields[] = fields.content?.modules || [];
  return (
    <BaseLayout title={title} description={description} image={image}>
      <PageModules modules={modules} />
    </BaseLayout>
  );
}

export const {handle} = cmsRoute({
  collection: 'Pages',
  slugParam: 'page',
});
