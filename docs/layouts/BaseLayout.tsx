import {Body, Head, Html, Script, useTranslations} from '@blinkk/root';
import {ComponentChildren} from 'preact';
import {GlobalFooter} from '@/components/GlobalFooter/GlobalFooter';
import {GlobalHeader} from '@/components/GlobalHeader/GlobalHeader';
import {GridOverlay} from '@/islands/GridOverlay/GridOverlay';
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
};

export function BaseLayout(props: BaseLayoutProps) {
  const t = useTranslations();
  const title = props.title || '';
  const description = props.description || '';

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
