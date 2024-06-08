import {IconMoodLookDown} from '@tabler/icons-preact';
import {Layout} from '../../layout/Layout.js';
import './NotFoundPage.css';

export function NotFoundPage() {
  return (
    <Layout>
      <div className="NotFoundPage">
        <div className="NotFoundPage__icon">
          <IconMoodLookDown size={60} />
        </div>
        <h2 className="NotFoundPage__title">Not Found</h2>
        <p className="NotFoundPage__body">
          Double-check the URL and try again or <a href="/cms">go home</a>.
        </p>
      </div>
    </Layout>
  );
}
