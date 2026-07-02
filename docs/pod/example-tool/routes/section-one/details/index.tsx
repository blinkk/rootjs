const containerStyle = {
  fontFamily: 'system-ui, sans-serif',
  padding: '16px',
  lineHeight: '1.6',
  fontSize: '14px',
};

export default function ExampleToolSectionOneDetails() {
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
