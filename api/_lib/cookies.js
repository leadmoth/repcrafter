function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx+1));
      out[k] = v;
    }
  });
  return out;
}
function setCookie(res, name, value, attrs = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (attrs.Path) parts.push(`Path=${attrs.Path}`);
  if (attrs.HttpOnly) parts.push('HttpOnly');
  if (attrs.Secure) parts.push('Secure');
  if (attrs.SameSite) parts.push(`SameSite=${attrs.SameSite}`);
  if (attrs.MaxAge) parts.push(`Max-Age=${attrs.MaxAge}`);
  if (attrs.Domain) parts.push(`Domain=${attrs.Domain}`);
  if (attrs.Expires) parts.push(`Expires=${attrs.Expires.toUTCString()}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}
module.exports = { parseCookies, setCookie };