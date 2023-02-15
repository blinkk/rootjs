import {Head, Script} from '@blinkk/root';
import {GlobalFooter} from '@/templates/global-footer/global-footer.js';
import {GlobalHeader} from '@/templates/global-header/global-header.js';
import {ComponentChildren} from 'preact';
import '@/styles/global.scss';

interface BaseLayoutProps {
  title?: string;
  description?: string;
  image?: string;
  noindex?: boolean;
  children?: ComponentChildren;
}

export function BaseLayout(props: BaseLayoutProps) {
  const title = props.title || '';
  const description = props.description || '';
  const image = props.image || '';
  const noindex = props.noindex || false;
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta content="website" property="og:type" />
        <meta content="" property="og:site_name" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content={title} property="og:title" />
        <meta content={title} name="twitter:title" />
        <meta name="description" content={description} />
        <meta name="og:description" content={description} />
        {image && <meta content={image} property="og:image" />}
        {image && <meta content={image} name="twitter:image" />}
        {image && <meta content="summary_large_image" name="twitter:card" />}
        {noindex && <meta name="robots" content="noindex" />}
      </Head>
      <div id="root">
        <GlobalHeader />
        <main id="main">{props.children}</main>
        <GlobalFooter />
      </div>
      <Script type="module" src="/bundles/main.ts" />
    </>
  );
}
