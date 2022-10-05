import {Head, Script} from '@blinkk/root';
import {GlobalFooter} from '@/templates/global-footer/global-footer';
import {GlobalHeader} from '@/templates/global-header/global-header';
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Open+Sans:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div id="root">
        <GlobalHeader />
        <main>{props.children}</main>
        <GlobalFooter />
      </div>
      {/* <Script type="module" src="/bundles/main.ts" /> */}
    </>
  );
}
