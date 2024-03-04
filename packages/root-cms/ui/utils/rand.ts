export function autokey(len?: number) {
  if (!len) {
    len = 6;
  }
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsLength = chars.length;
  for (let i = 0; i < len; i++) {
    result.push(chars.charAt(Math.floor(Math.random() * charsLength)));
  }
  return result.join('');
}
