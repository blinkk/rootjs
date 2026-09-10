import {useEffect} from 'preact/hooks';
import {useSiteSettings} from './useSiteSettings.js';
import {useUserPreferences} from './useUserPreferences.js';

/** The user preference holding the chosen theme's id. */
export const THEME_PREFERENCE_KEY = 'theme';

/** Preference value meaning "no theme, the stock CMS". */
export const STOCK_THEME = 'none';

/** The user preference holding the user's own CSS. */
export const CUSTOM_CSS_PREFERENCE_KEY = 'customCss';

/** The `<link>` the server renders for the default theme's stylesheet. */
const LINK_ID = 'root-cms-theme';

export interface ThemeOption {
  id: string;
  name: string;
  hash: string;
}

/** The themes the project registered, and which one applies by default. */
export function getThemeConfig(): {
  defaultTheme: string | null;
  themes: ThemeOption[];
} {
  const theme = window.__ROOT_CTX.theme;
  return {
    defaultTheme: theme?.default ?? null,
    themes: theme?.themes ?? [],
  };
}

/**
 * The theme to show this user: their choice when it names a registered
 * theme (or the stock CMS), else the project's default.
 */
export function resolveTheme(
  preference: unknown,
  defaultTheme: string | null,
  themes: ThemeOption[]
): ThemeOption | null {
  if (preference === STOCK_THEME) {
    return null;
  }
  const id =
    typeof preference === 'string' &&
    themes.some((theme) => theme.id === preference)
      ? preference
      : defaultTheme;
  return themes.find((theme) => theme.id === id) ?? null;
}

/**
 * Points the page's theme stylesheet at `theme`, or removes it. The server
 * renders the default's `<link>`, so a user on the default never sees a
 * swap; everyone else gets theirs as soon as preferences load.
 */
function applyTheme(theme: ThemeOption | null) {
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!theme) {
    existing?.remove();
    return;
  }
  const href = `/cms/themes/${theme.id}.css?c=${theme.hash}`;
  if (existing) {
    if (existing.getAttribute('href') !== href) {
      existing.setAttribute('href', href);
    }
    return;
  }
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  // After the CMS's own stylesheet, before any custom CSS.
  const base = document.querySelector<HTMLLinkElement>(
    'link[href*="/cms/static/ui.css"]'
  );
  const siteCss = document.getElementById('root-cms-site-css');
  if (siteCss) {
    siteCss.before(link);
  } else if (base) {
    base.after(link);
  } else {
    document.head.appendChild(link);
  }
}

/**
 * Keeps a `<style>` at the end of the head in sync with `css`, so custom CSS
 * from the UI lands last in the cascade: base, theme, then the site's, then
 * the user's. `textContent` is set rather than parsed, so the CSS cannot
 * break out of the element.
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
 * Loads the user's theme, then the site's and the user's custom CSS, into
 * the page whenever any of them changes.
 */
export function ThemeLoader() {
  const {preferences} = useUserPreferences();
  const {settings} = useSiteSettings();
  const preference = preferences[THEME_PREFERENCE_KEY];
  const siteCss = settings.customCss;
  const userCss = preferences[CUSTOM_CSS_PREFERENCE_KEY];
  useEffect(() => {
    const {defaultTheme, themes} = getThemeConfig();
    applyTheme(resolveTheme(preference, defaultTheme, themes));
  }, [preference]);
  useEffect(() => {
    applyCustomCss('root-cms-site-css', siteCss);
    applyCustomCss('root-cms-user-css', userCss);
  }, [siteCss, userCss]);
  return null;
}
