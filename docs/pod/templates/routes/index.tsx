import path from 'node:path';

const TEMPLATE_NAMES = [
  'Divider',
  'Section',
  'Spacer',
  'Template50x50',
  'TemplateHeadline',
  'TemplateImage',
  'TemplateJumplinks',
  'TemplatePoweredBy',
  'TemplateSandbox',
];

export default function TemplatesList() {
  return (
    <div style={{fontFamily: 'system-ui, sans-serif', padding: '16px'}}>
      <h2 style={{fontSize: '16px', margin: '0 0 12px'}}>
        Available Templates
      </h2>
      <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
        {TEMPLATE_NAMES.map((name) => (
          <li
            key={name}
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #eee',
              fontSize: '14px',
            }}
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
