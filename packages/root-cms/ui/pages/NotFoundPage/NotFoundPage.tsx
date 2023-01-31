import {Layout} from '../../layout/Layout.js';
import './NotFoundPage.css';

export function NotFoundPage() {
  return (
    <Layout>
      <div className="NotFoundPage">
        <h1>Not Found</h1>
        <p>
          This page may be under construction. Double-check the URL and try
          again or <a href="/cms">go home</a>.
        </p>
      </div>
    </Layout>
  );
}
