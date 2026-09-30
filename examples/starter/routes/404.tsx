import {BaseLayout} from '@/layouts/BaseLayout.js';

export default function NotFound() {
  return (
    <BaseLayout title="Not found" noindex>
      <section style={{padding: '80px 24px', textAlign: 'center'}}>
        <h1>404: Page not found</h1>
        <p>The page you are looking for was not found.</p>
      </section>
    </BaseLayout>
  );
}
