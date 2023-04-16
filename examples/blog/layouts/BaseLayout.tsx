import {Head} from '@blinkk/root';
import {ComponentChildren} from 'preact';

import {GridOverlay} from '@/components/GridOverlay/GridOverlay.js';
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
        <main id="main">{props.children}</main>
      </div>
      <GridOverlay />
    </>
  );
}
