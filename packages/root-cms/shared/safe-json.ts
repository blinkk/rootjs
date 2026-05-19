const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * `JSON.stringify` does not escape characters that have meaning to an HTML
 * parser, so a value containing `</script>` (or U+2028 / U+2029, which the
 * JS spec treats as line terminators) embedded inside an inline `<script>`
 * tag can break out of the script element and execute as HTML. This helper
 * escapes those characters so the result is safe to interpolate into a
 * `<script>` body.
 *
 * https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
 */
export function serializeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029');
}
