import {BaseLayout} from '@/layouts/base';
import styles from './index.module.scss';

export function Page() {
  return (
    <BaseLayout title="Root.js | Modern framework for a modern web">
      <Page.Hero />
      <Page.Features />
    </BaseLayout>
  );
}

Page.Hero = () => (
  <div class={styles.hero}>
    <div class="container">
      <div class={styles.heroContent}>
        <div class={styles.heroEyebrow}>
          <span class={styles.heroEyebrowText}>Root.js</span>
          <Page.AlphaTag />
        </div>
        <h1 class={styles.heroTitle}>Modern framework for a modern web</h1>
        <div class={styles.heroBody}>
          Root.js combines the best developer experiences without sacrificing
          production performance in a way that is familiar and modern.
        </div>
        <div class={styles.heroButtons}>
          <a class={styles.buttonFilled} href="/guide">
            Get started
          </a>
          <a class={styles.buttonOutlined} href="/guide/features">
            Features
          </a>
        </div>
      </div>
      <div class={styles.heroBg}>
        <div class={styles.heroBgShape} />
      </div>
    </div>
  </div>
);

Page.Features = () => (
  <div class={styles.features}>
    <div class="container">
      <Page.FeatureCard
        title="Powered by Vite"
        body="All of the modern features supported by Vite: blazing fast HMR, plugins support, and more."
      />
      <Page.FeatureCard
        title="TSX rendering"
        body="HTML is rendered by TSX server components, with zero JS sent to the client by default."
      />
      <Page.FeatureCard
        title="Web components"
        body="Custom elements are auto-detected and its deps are auto-injected into the page."
      />
      <Page.FeatureCard
        title="Built-in i18n"
        body="I18n is a first class feature, including localized routing and tools for managing translations."
      />
    </div>
  </div>
);

interface FeatureCardProps {
  title: string;
  body: string;
}

Page.FeatureCard = (props: FeatureCardProps) => {
  return (
    <div class={styles.featureCard}>
      <div class={styles.featureCardTitle}>{props.title}</div>
      <div class={styles.featureCardBody}>{props.body}</div>
    </div>
  );
};

Page.AlphaTag = () => (
  <div class={styles.alphaTag}>
    <div class={styles.alphaTagText}>ALPHA</div>
  </div>
);

export default Page;
