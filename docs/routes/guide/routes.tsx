import {Guide} from '@/layouts/guide';

export function Page() {
  const toc = [
    {id: 'overview', label: 'Overview'},
    {id: 'getStaticProps', label: 'getStaticProps()'},
    {id: 'getStaticPaths', label: 'getStaticPaths()'},
    {id: 'custom-404', label: '404.tsx'},
  ];
  return (
    <Guide title="Routes | Root.js" toc={toc}>
      <h1>Routes</h1>

      <h2 id="overview">Overview</h2>
      <p>
        Root.js uses filesystem based routing similar to Next.js. Routes are
        defined within the <code>/routes</code> folder and render TSX files as
        server-rendered components.
      </p>
      <p>
        Below are a few examples of routes files and the final serving path:
      </p>
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Matching URL(s)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>routes/index.tsx</code>
            </td>
            <td>
              <code>/</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>routes/about.tsx</code>
            </td>
            <td>
              <code>/about</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>routes/blog/index.tsx</code>
            </td>
            <td>
              <code>/blog</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>routes/blog/[slug].tsx</code>
            </td>
            <td>
              <div>
                <code>/blog/foo</code>
              </div>
              <div>
                <code>/blog/bar</code>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <h2 id="getStaticProps">getStaticProps()</h2>
      <p>
        If a exported function called <code>getStaticProps</code> exists in the
        route, the props returned from that function will be passed to the
        component.
      </p>
      <p>
        Routes that use placeholder params like <code>[slug].tsx</code> will
        have these params passed into a context variable to
        <code>getStaticProps</code>.
      </p>

      <p>Example:</p>
      <root-code
        code={JSON.stringify(`// routes/[slug].tsx

import {GetStaticProps} from '@blinkk/root';

export default function Page(props) {
  console.log('db content: ', props.content);
  return <h1>The slug is {props.slug}</h1>;
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  const slug = ctx.params.slug;
  const content = await fetchDataFromDatabase(slug);
  return {props: {slug, content}};
};
`)}
        language="typescript"
      />

      <h2 id="getStaticPaths">getStaticPaths()</h2>
      <p>
        For routes that use placeholder params, projects that build sites using
        SSG will need to deterministically know what paths are available for
        that route. Export a <code>getStaticPaths()</code> function in the route
        and return a list of params.
      </p>
      <p>Example:</p>
      <root-code
        code={JSON.stringify(`// routes/[slug].tsx

import {GetStaticPaths} from '@blinkk/root';

export default function Page(props) {
  return <h1>hello world</h1>;
}

export const getStaticPaths: GetStaticPaths = async (ctx) => {
  const slugs = await listAllFromDb(slug);
  return {paths: slugs.map((slug) => {params: {slug}})};
};
`)}
        language="typescript"
      />

      <h2 id="custom-404">404.tsx</h2>
      <p>
        To define a custom 404 page, add a route at
        <code>/routes/404.tsx</code>. On prod, that route will be rendered when
        no other route matches the given request.
      </p>
    </Guide>
  );
}

export default Page;
