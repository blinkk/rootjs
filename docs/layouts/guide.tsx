import {Head} from '@blinkk/root';
import {BaseLayout} from './base';
import {ComponentChildren} from 'preact';
import styles from './guide.module.scss';

export interface GuideProps {
  title?: string;
  description?: string;
  children?: ComponentChildren;
  toc?: TOCItem[];
}

interface TOCItem {
  id: string;
  label: string;
}

export function Guide(props: GuideProps) {
  const toc = props.toc || [];
  return (
    <BaseLayout title={props.title} description={props.description}>
      <Head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.6.0/styles/night-owl.min.css"
        />
      </Head>
      <div class={styles.layout}>
        <Guide.Sidebar />
        <div class={styles.contentWrap}>
          <Guide.TOC toc={toc} />
          <div class={styles.content}>{props.children}</div>
        </div>
      </div>
    </BaseLayout>
  );
}

Guide.TOC = (props: {toc: TOCItem[]}) => {
  if (props.toc.length === 0) {
    return null;
  }
  return (
    <div class={styles.toc}>
      <div class={styles.tocTitle}>On this page</div>
      <div class={styles.tocItems}>
        {props.toc.map((tocItem) => (
          <a href={`#${tocItem.id}`}>{tocItem.label}</a>
        ))}
      </div>
    </div>
  );
};

Guide.Sidebar = () => (
  <aside class={styles.sidebar}>
    <div class={styles.sidebarSection}>
      <div class={styles.sidebarSectionTitle}>Guide</div>
      <div class={styles.sidebarSectionItems}>
        <a href="/guide">Getting started</a>
        <a href="/guide/features">Features</a>
        <a href="/guide/project-structure">Project structure</a>
        <a href="/guide/routes">Routes</a>
      </div>
    </div>
    <div class={styles.sidebarSection}>
      <div class={styles.sidebarSectionTitle}>API</div>
      <div class={styles.sidebarSectionItems}>
        <a href="/guide/api">API reference</a>
        <a href="/guide/cli">CLI reference</a>
      </div>
    </div>
    <div class={styles.sidebarSection}>
      <div class={styles.sidebarSectionTitle}>Config</div>
      <div class={styles.sidebarSectionItems}>
        <a href="/guide/config">Config reference</a>
      </div>
    </div>
  </aside>
);
