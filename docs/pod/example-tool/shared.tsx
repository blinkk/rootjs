/**
 * Shared page components for the example sidebar tools. Two pods (`a` and `b`)
 * render these from their own `routes/` dirs so each pod has distinct route
 * file paths (pod routes are keyed by file path, so two pods can't share a
 * single routes dir). Links use relative hrefs so the same pages work under
 * either mount (`/cms-tools/a/` or `/cms-tools/b/`).
 */

const containerStyle = {
  fontFamily: 'system-ui, sans-serif',
  padding: '16px',
  lineHeight: '1.6',
  fontSize: '14px',
};

export function ExampleToolHome() {
  return (
    <div style={containerStyle}>
      <h2 style={{fontSize: '16px', margin: '0 0 8px'}}>Example Tool — Home</h2>
      <p style={{margin: '0 0 12px'}}>
        Navigate around and watch the CMS address bar mirror the sub-path, query
        params, and hash.
      </p>
      <ul style={{paddingLeft: '18px', margin: 0}}>
        <li>
          <a href="section-one/">section-one/</a>
        </li>
        <li>
          <a href="section-one/details/">section-one/details/</a>
        </li>
        <li>
          <a href="section-one/?tab=advanced#notes">
            section-one/?tab=advanced#notes
          </a>
        </li>
      </ul>
    </div>
  );
}

export function ExampleToolSectionOne() {
  return (
    <div style={containerStyle}>
      <h2 style={{fontSize: '16px', margin: '0 0 8px'}}>
        Example Tool — section-one
      </h2>
      <ul style={{paddingLeft: '18px', margin: 0}}>
        <li>
          <a href="details/">details/</a>
        </li>
        <li>
          <a href="../">← back home</a>
        </li>
      </ul>
    </div>
  );
}

export function ExampleToolSectionOneDetails() {
  return (
    <div style={containerStyle}>
      <h2 style={{fontSize: '16px', margin: '0 0 8px'}}>
        Example Tool — section-one / details
      </h2>
      <p style={{margin: '0 0 12px'}}>
        The CMS URL should now read{' '}
        <code>/cms/tools/&lt;id&gt;/section-one/details/</code>.
      </p>
      <ul style={{paddingLeft: '18px', margin: 0}}>
        <li>
          <a href="../">← back to section-one</a>
        </li>
        <li>
          <a href="../../">← back home</a>
        </li>
      </ul>
    </div>
  );
}
