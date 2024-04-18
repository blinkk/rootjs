import {Body, Head, Html, Script, useTranslations} from '@blinkk/root';
import {ComponentChildren} from 'preact';
import {GlobalFooter} from '@/components/GlobalFooter/GlobalFooter.js';
import {GlobalHeader} from '@/components/GlobalHeader/GlobalHeader.js';
import {useImageService} from '@/hooks/useImageService.js';
import {GridOverlay} from '@/islands/GridOverlay/GridOverlay.js';
import '@/styles/global.scss';

export interface BaseLayoutProps {
  title?: string;
  description?: string;
  image?: string;
  noindex?: boolean;
  hideFooter?: boolean;
  children?: ComponentChildren;
}

const Meta = {
  SITE_NAME: 'Root.js',
  DOMAIN: 'https://rootjs.dev',
  IMAGE:
    'https://lh3.googleusercontent.com/c2ECbvhJtxf3xbPIjaXCSpmvAsJkkhzJwG98T9RPvWy4s30jZKClom8pvWTnupRYOnyI3qGhNXPOwqoN6sqljkDO62LIKRtR988',
};

const ANALYTICS = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-5JTQHSPWBB');
`;

export function BaseLayout(props: BaseLayoutProps) {
  const t = useTranslations();
  const title = props.title || '';
  const description = props.description || '';
  const image = props.image || Meta.IMAGE;
  const imageService = useImageService();
  const metaImage = imageService.transform(image, {
    width: 1200,
    jpg: true,
  });

  return (
    <Html>
      <Head>
        <title>{t(title)}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta content="website" property="og:type" />
        <meta content={Meta.SITE_NAME} property="og:site_name" />
        <meta content={t(title)} property="og:title" />
        <meta content={t(title)} name="twitter:title" />
        {description && (
          <>
            <meta name="description" content={t(description)} />
            <meta name="og:description" content={t(description)} />
          </>
        )}
        {metaImage && (
          <>
            {metaImage && <meta content={metaImage} property="og:image" />}
            {metaImage && <meta content={metaImage} name="twitter:image" />}
            <meta content="summary_large_image" name="twitter:card" />
          </>
        )}
        {props.noindex && <meta name="robots" content="noindex" />}
        <link
          rel="icon"
          href="https://lh3.googleusercontent.com/ijK50TfQlV_yJw3i-CMlnD6osH4PboZBILZrJcWhoNMEmoyCD5e1bAxXbaOPe5w4gG_Scf37EXrmZ6p8sP2lue5fLZ419m5JyLMs=e385-w256"
          type="image/png"
        />
        <style>@layer base, component, template;</style>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.6.0/styles/atom-one-light.min.css"
        />
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-5JTQHSPWBB"
        ></script>
        <script dangerouslySetInnerHTML={{__html: ANALYTICS}} />
      </Head>
      <Body>
        <div id="root">
          <GlobalHeader />
          <main id="main">{props.children}</main>
          {!props.hideFooter && <GlobalFooter />}
          <GridOverlay />
          <Script src="/bundles/main.ts" />
        </div>
      </Body>
    </Html>
  );
}
