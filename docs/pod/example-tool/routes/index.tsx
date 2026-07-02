const containerStyle = {
  fontFamily: 'system-ui, sans-serif',
  padding: '16px',
  lineHeight: '1.6',
  fontSize: '14px',
};

/**
 * Landing page for the example tool. Links use relative hrefs so the same pod
 * routes work regardless of which id the tool is mounted under (e.g.
 * `/cms-tools/a/` or `/cms-tools/b/`).
 */
export default function ExampleToolHome() {
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
