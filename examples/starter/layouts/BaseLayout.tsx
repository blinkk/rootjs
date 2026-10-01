import {Body, Head, Html} from '@blinkk/root';
import {ComponentChildren} from '@blinkk/root/jsx';
import {GlobalFooter} from '@/components/GlobalFooter/GlobalFooter.js';
import {GlobalHeader} from '@/components/GlobalHeader/GlobalHeader.js';
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
  return (
    <Html>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {image && <meta property="og:image" content={image} />}
        {image && <meta name="twitter:card" content="summary_large_image" />}
        {props.noindex && <meta name="robots" content="noindex" />}
      </Head>
      <Body>
        <GlobalHeader />
        <main>{props.children}</main>
        <GlobalFooter />
      </Body>
    </Html>
  );
}
