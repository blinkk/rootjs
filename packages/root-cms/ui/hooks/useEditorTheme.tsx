import {useEffect} from 'preact/hooks';
import {useSiteSettings} from './useSiteSettings.js';
import {useUserPreferences} from './useUserPreferences.js';

/** User preference: `false` switches the project's theme off for this user. */
export const PROJECT_THEME_PREFERENCE_KEY = 'projectTheme';

/** User preference: the user's own CSS. */
export const CUSTOM_CSS_PREFERENCE_KEY = 'customCss';

/** The `<link>` the server renders for the project's theme stylesheet. */
const PROJECT_THEME_ID = 'root-cms-theme';

/** Whether the project configured a theme (`cmsPlugin({theme})`). */
export function hasProjectTheme(): boolean {
  return Boolean(window.__ROOT_CTX.theme?.configured);
}

/** The project's theme applies unless the user switched it off. */
export function usesProjectTheme(preference: unknown): boolean {
  return preference !== false;
}

/**
 * Switches the server-rendered project theme on or off. The element stays
 * in place, so switching it back on needs no reload or refetch.
 */
function applyProjectTheme(enabled: boolean) {
  const link = document.getElementById(
    PROJECT_THEME_ID
  ) as HTMLLinkElement | null;
  if (link) {
    link.disabled = !enabled;
  }
}

/**
 * Keeps a `<style>` at the end of the head in sync with `css`, so custom CSS
 * from the UI lands last in the cascade: base, project theme, then the
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
 * Applies the user's choice about the project theme, then the site's and
 * the user's custom CSS, to the page whenever any of them changes.
 */
export function EditorThemeApplier() {
  const {preferences} = useUserPreferences();
  const {settings} = useSiteSettings();
  const projectTheme = preferences[PROJECT_THEME_PREFERENCE_KEY];
  const siteCss = settings.customCss;
  const userCss = preferences[CUSTOM_CSS_PREFERENCE_KEY];
  useEffect(() => {
    applyProjectTheme(usesProjectTheme(projectTheme));
  }, [projectTheme]);
  useEffect(() => {
    applyCustomCss('root-cms-site-css', siteCss);
    applyCustomCss('root-cms-user-css', userCss);
  }, [siteCss, userCss]);
  return null;
}
