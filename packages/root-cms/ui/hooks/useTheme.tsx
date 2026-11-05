import {useEffect} from 'preact/hooks';
import {NO_THEME, THEME_LINK_ID, themeStorageKey} from '../../shared/theme.js';
import {useSiteSettings} from './useSiteSettings.js';
import {useUserPreferences} from './useUserPreferences.js';

export {NO_THEME};

/** The user preference holding the chosen theme's id. */
export const THEME_PREFERENCE_KEY = 'theme';

/** The user preference holding the user's own CSS. */
export const CUSTOM_CSS_PREFERENCE_KEY = 'customCss';

export interface ThemeOption {
  id: string;
  name: string;
  hash: string;
  /** The cache-busted stylesheet URL. */
  href: string;
}

/**
 * The themes a user can pick (the project's, then the built-in ones), and
 * which one applies by default.
 */
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
 * theme (or no theme at all), else the project's default.
 */
export function resolveTheme(
  preference: unknown,
  defaultTheme: string | null,
  themes: ThemeOption[]
): ThemeOption | null {
  if (preference === NO_THEME) {
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
 * renders the default's `<link>` (or the theme this browser last used, see
 * `rememberTheme()`), so most loads never see a swap.
 */
function applyTheme(theme: ThemeOption | null) {
  const existing = document.getElementById(
    THEME_LINK_ID
  ) as HTMLLinkElement | null;
  if (!theme) {
    existing?.remove();
    return;
  }
  const href = theme.href;
  if (existing) {
    if (existing.getAttribute('href') !== href) {
      existing.setAttribute('href', href);
    }
    return;
  }
  const link = document.createElement('link');
  link.id = THEME_LINK_ID;
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
 * Remembers the user's choice on this browser, so the next page load can
 * apply it before their preferences arrive. No choice (or one naming a
 * theme that's gone) is forgotten, so the project's default applies.
 */
function rememberTheme(preference: unknown, themes: ThemeOption[]) {
  const key = themeStorageKey(window.__ROOT_CTX.rootConfig.projectId);
  const known =
    preference === NO_THEME || themes.some((theme) => theme.id === preference);
  try {
    if (known) {
      window.localStorage.setItem(key, preference as string);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (e.g. blocked); the theme still applies.
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
 * the page whenever any of them changes. The theme waits for the user's
 * preferences, keeping the one the page loaded with until then.
 */
export function ThemeLoader() {
  const {preferences, loaded} = useUserPreferences();
  const {settings} = useSiteSettings();
  const preference = preferences[THEME_PREFERENCE_KEY];
  const siteCss = settings.customCss;
  const userCss = preferences[CUSTOM_CSS_PREFERENCE_KEY];
  useEffect(() => {
    if (!loaded) {
      return;
    }
    const {defaultTheme, themes} = getThemeConfig();
    applyTheme(resolveTheme(preference, defaultTheme, themes));
    rememberTheme(preference, themes);
  }, [loaded, preference]);
  useEffect(() => {
    applyCustomCss('root-cms-site-css', siteCss);
    applyCustomCss('root-cms-user-css', userCss);
  }, [siteCss, userCss]);
  return null;
}
