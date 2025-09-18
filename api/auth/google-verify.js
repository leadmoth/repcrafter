// Google ID token verify + Stripe customer + session cookie.

const https = require('https');
const { setCookie } = require('../_lib/cookies');
const { sign } = require('../_lib/jwt');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`tokeninfo ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function readJsonBody(req) {
  if (req.body) {
    try { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body; }
    catch {}
  }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
  });
}

function isHttps(req) {
  const xf = req.headers['x-forwarded-proto'];
  return xf ? String(xf).split(',')[0].trim() === 'https' : !!(req.connection && req.connection.encrypted);
}

async function verifyGoogleIdToken(idToken, clientId) {
  if (!idToken) throw new Error('missing_credential');
  if (!clientId) throw new Error('server_misconfigured: GOOGLE_CLIENT_ID missing');
  const data = await getJSON(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (data.aud !== clientId) throw new Error(`bad_audience: expected ${clientId} got ${data.aud}`);
  if (data.iss !== 'https://accounts.google.com' && data.iss !== 'accounts.google.com') {
    throw new Error(`bad_issuer: ${data.iss}`);
  }
  return { sub: data.sub, email: data.email, name: data.name, picture: data.picture };
}

function safeRequireStripe() {
  try { return require('stripe'); } catch { return null; }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    const body = await readJsonBody(req);
    const { credential } = body || {};

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const sessionSecret = process.env.SESSION_SECRET;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const Stripe = safeRequireStripe();

    if (!sessionSecret) {
      return res.status(500).json({ error: 'server_misconfigured', detail: 'SESSION_SECRET missing' });
    }
    if (!clientId) {
      return res.status(500).json({ error: 'server_misconfigured', detail: 'GOOGLE_CLIENT_ID missing' });
    }

    const claims = await verifyGoogleIdToken(credential, clientId);

    // Ensure a Stripe Customer exists and capture its ID
    let stripe_customer_id = null;
    if (Stripe && stripeKey && claims.email) {
      try {
        const stripe = Stripe(stripeKey, { apiVersion: '2024-06-20' });
        const existing = await stripe.customers.list({ email: claims.email, limit: 1 });
        const customer = existing.data?.[0] || await stripe.customers.create({ email: claims.email, name: claims.name });
        stripe_customer_id = customer.id;
      } catch (e) {
        console.warn('[google-verify] Stripe customer lookup failed:', e.message);
      }
    }

    const token = sign(
      {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
        stripe_customer_id
      },
      sessionSecret,
      { expiresIn: 60 * 60 * 24 * 30 } // 30 days
    );

    setCookie(res, 'session', token, {
      Path: '/',
      HttpOnly: true,
      Secure: isHttps(req),
      SameSite: 'Lax',
      MaxAge: 60 * 60 * 24 * 30
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[auth/google-verify] failed:', e);
    res.status(400).json({ error: 'auth_failed', detail: String(e && e.message || e) });
  }
};
