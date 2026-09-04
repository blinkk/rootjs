import {useEffect} from 'preact/hooks';
import {useSiteSettings} from './useSiteSettings.js';
import {useUserPreferences} from './useUserPreferences.js';

/** The user preference key holding the chosen theme. */
export const THEME_PREFERENCE_KEY = 'theme';

/** The user preference key holding the user's own CSS. */
export const CUSTOM_CSS_PREFERENCE_KEY = 'customCss';

/** Preference value meaning "no theme, the stock editor". */
export const STOCK_THEME = 'none';

const LINK_ID = 'root-cms-theme';

/** What the project ships: its default theme and the built-ins on offer. */
export function getEditorThemeConfig(): {
  defaultTheme: string | null;
  available: string[];
} {
  const theme = window.__ROOT_CTX.theme;
  return {
    defaultTheme: theme?.default ?? null,
    available: theme?.available ?? [],
  };
}

/**
 * The theme the editor should show for this user: their preference when it
 * names a built-in (or the stock editor), else the project default.
 */
export function resolveUserTheme(
  preference: unknown,
  defaultTheme: string | null,
  available: string[]
): string | null {
  if (preference === STOCK_THEME) {
    return null;
  }
  if (typeof preference === 'string' && available.includes(preference)) {
    return preference;
  }
  return defaultTheme;
}

/**
 * Points the page's theme stylesheet at `name`, or removes it. The server
 * renders the project default's `<link>`, so a user on the default never
 * sees a swap; everyone else gets theirs as soon as preferences load.
 */
function applyTheme(name: string | null) {
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!name) {
    existing?.remove();
    return;
  }
  // Reuse the base stylesheet's cache-bust so a deploy refreshes both.
  const base = document.querySelector<HTMLLinkElement>(
    'link[href*="/cms/static/ui.css"]'
  );
  const query = base ? new URL(base.href).search : '';
  const href = `/cms/static/themes/${name}.css${query}`;
  if (existing) {
    if (!existing.getAttribute('href')?.startsWith(href)) {
      existing.setAttribute('href', href);
    }
    return;
  }
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  // Keep the project's inline CSS last in the cascade.
  const inline = base?.parentElement?.querySelector('style[nonce]');
  if (base && inline) {
    inline.before(link);
  } else if (base) {
    base.after(link);
  } else {
    document.head.appendChild(link);
  }
}

/**
 * Keeps a `<style>` at the end of the head in sync with `css`, so custom CSS
 * from the UI lands last in the cascade: base, theme, project CSS, then the
 * site's, then the user's. `textContent` is set rather than parsed, so the
 * CSS cannot break out of the element.
 */
function applyCustomCss(id: string, css: unknown) {
  const text = typeof css === 'string' ? css.trim() : '';
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!text) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = id;
  }
  if (style.textContent !== text) {
    style.textContent = text;
  }
  // Re-append so the order stays site then user even after one is re-added.
  document.head.appendChild(style);
}

/**
 * Applies the user's theme choice, then the site's and the user's custom
 * CSS, to the page whenever any of them changes.
 */
export function EditorThemeApplier() {
  const {preferences} = useUserPreferences();
  const {settings} = useSiteSettings();
  const preference = preferences[THEME_PREFERENCE_KEY];
  const siteCss = settings.customCss;
  const userCss = preferences[CUSTOM_CSS_PREFERENCE_KEY];
  useEffect(() => {
    const {defaultTheme, available} = getEditorThemeConfig();
    applyTheme(resolveUserTheme(preference, defaultTheme, available));
  }, [preference]);
  useEffect(() => {
    applyCustomCss('root-cms-site-css', siteCss);
    applyCustomCss('root-cms-user-css', userCss);
  }, [siteCss, userCss]);
  return null;
}
