const containerStyle = {
  fontFamily: 'system-ui, sans-serif',
  padding: '16px',
  lineHeight: '1.6',
  fontSize: '14px',
};

export default function ExampleToolSectionOne() {
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
