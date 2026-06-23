import {useRequestContext} from '@blinkk/root';
import {IsLocaleFields} from '@/root-cms.js';

export function testIsLocale(condition: IsLocaleFields): boolean {
  const locales = condition.locales || [];
  if (locales.length === 0) {
    return true;
  }
  const ctx = useRequestContext();
  return locales.includes(ctx.locale);
}
