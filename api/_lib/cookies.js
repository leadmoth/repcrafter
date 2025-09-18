// Simple cookie helpers for Vercel/Node serverless.

function serializeCookie(name, value, attrs = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (attrs.Path) parts.push(`Path=${attrs.Path}`);
  if (attrs.Domain) parts.push(`Domain=${attrs.Domain}`);
  if (attrs.MaxAge != null) parts.push(`Max-Age=${Math.floor(attrs.MaxAge)}`);
  if (attrs.Expires instanceof Date) parts.push(`Expires=${attrs.Expires.toUTCString()}`);
  if (attrs.HttpOnly) parts.push('HttpOnly');
  if (attrs.Secure) parts.push('Secure');
  if (attrs.SameSite) {
    const ss = String(attrs.SameSite);
    if (['Strict', 'Lax', 'None'].includes(ss)) parts.push(`SameSite=${ss}`);
  }

  return parts.join('; ');
}

function setCookie(res, name, value, attrs = {}) {
  const cookie = serializeCookie(name, value, attrs);
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', prev.concat(cookie));
  } else {
    res.setHeader('Set-Cookie', [prev, cookie]);
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

module.exports = { setCookie, parseCookies };
