// Minimal HS256 JWT sign/verify using Node's crypto (no external deps).
// Usage:
//   const { sign, verify } = require('../_lib/jwt');
//   const token = sign({ sub: '123' }, process.env.SESSION_SECRET, { expiresIn: 60*60 });
//   const payload = verify(token, process.env.SESSION_SECRET);

const crypto = require('crypto');

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlJSON(obj) {
  return b64url(JSON.stringify(obj));
}

function hmacSHA256(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest();
}

function parseTimespan(sec) {
  if (!sec) return undefined;
  if (typeof sec === 'number') return sec;
  if (typeof sec === 'string') {
    // naive parser: supports "30d", "12h", "15m", "45s"
    const m = /^(\d+)([smhd])$/.exec(sec.trim());
    if (!m) return Number(sec) || undefined;
    const n = Number(m[1]);
    const unit = m[2];
    const factor = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return n * factor;
  }
  return undefined;
}

function sign(payload, secret, options = {}) {
  if (!secret) throw new Error('SESSION_SECRET missing');
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, ...payload };
  const expSec = parseTimespan(options.expiresIn);
  if (expSec) body.exp = now + expSec;

  const encodedHeader = b64urlJSON(header);
  const encodedPayload = b64urlJSON(body);
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = b64url(hmacSHA256(data, secret));
  return `${data}.${signature}`;
}

function verify(token, secret) {
  if (!secret) throw new Error('SESSION_SECRET missing');
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('invalid_token');
  }
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = b64url(hmacSHA256(data, secret));
  if (signature !== expectedSig) throw new Error('invalid_signature');

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    throw new Error('invalid_payload');
  }
  if (payload && typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) throw new Error('token_expired');
  }
  return payload;
}

module.exports = { sign, verify };
