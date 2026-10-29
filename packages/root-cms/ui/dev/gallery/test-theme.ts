/**
 * A deliberately loud theme for the UI gallery. It overrides every color,
 * type and shape token, so anything that doesn't change under it is
 * hard-coded instead of reading `theme.css`.
 */
export const TEST_THEME: Record<string, string> = {
  '--cms-color-page': '#fdf4e3',
  '--cms-color-surface': '#fffbf2',
  '--cms-color-surface-hover': '#fbe8c4',
  '--cms-color-surface-active': '#f6d48e',
  '--cms-color-chip': '#e9d5ff',
  '--cms-color-overlay': 'rgba(76, 29, 149, 0.45)',
  '--cms-color-border': '#c084fc',
  '--cms-color-border-strong': '#7e22ce',
  '--cms-color-text': '#3b0764',
  '--cms-color-text-strong': '#1e0336',
  '--cms-color-text-muted': '#9333ea',
  '--cms-color-text-subtle': '#c4a3e6',
  '--cms-color-text-inverse': '#fef9c3',
  '--cms-color-link': '#db2777',
  '--cms-color-primary': '#0f766e',
  '--cms-color-primary-hover': '#115e59',
  '--cms-color-on-primary': '#fef9c3',
  '--cms-accent': '#f97316',
  '--cms-color-focus': '#e11d48',
  '--cms-color-info': '#0369a1',
  '--cms-color-info-soft': '#cffafe',
  '--cms-color-info-line': '#22d3ee',
  '--cms-color-success': '#15803d',
  '--cms-color-success-soft': '#d9f99d',
  '--cms-color-success-line': '#84cc16',
  '--cms-color-warning': '#a16207',
  '--cms-color-warning-soft': '#fef08a',
  '--cms-color-warning-line': '#eab308',
  '--cms-color-danger': '#be123c',
  '--cms-color-danger-soft': '#fecdd3',
  '--cms-color-danger-line': '#fb7185',
  '--cms-font-sans': 'Georgia, serif',
  '--cms-font-mono': '"Courier New", monospace',
  '--cms-text-xs': '12px',
  '--cms-text-sm': '13px',
  '--cms-text-base': '16px',
  '--cms-text-lg': '19px',
  '--cms-text-xl': '24px',
  '--cms-text-2xl': '30px',
  '--cms-radius-sm': '0px',
  '--cms-radius-md': '12px',
  '--cms-radius-lg': '20px',
  '--cms-radius-xl': '28px',
  '--cms-shadow-sm': '3px 3px 0 #7e22ce',
  '--cms-shadow-md': '6px 6px 0 #7e22ce',
  '--cms-shadow-lg': '10px 10px 0 #7e22ce',
};

/** Applies (or removes) the test theme on the document root. */
export function applyTestTheme(enabled: boolean) {
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(TEST_THEME)) {
    if (enabled) {
      style.setProperty(name, value);
    } else {
      style.removeProperty(name);
    }
  }
}
