// Robust Google ID token verify + Stripe customer + session cookie with detailed errors.
const https = require('https');
const { setCookie } = require('../_lib/cookies');
const { sign } = require('../_lib/jwt');
const Stripe = require('stripe');

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

function isHttps(req) {
  const xf = req.headers['x-forwarded-proto'];
  return xf ? String(xf).split(',')[0].trim() === 'https' : !!(req.connection && req.connection.encrypted);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    const { credential } = req.body || {};
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const sessionSecret = process.env.SESSION_SECRET;
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!sessionSecret) return res.status(500).json({ error: 'server_misconfigured', detail: 'SESSION_SECRET missing' });
    if (!clientId) return res.status(500).json({ error: 'server_misconfigured', detail: 'GOOGLE_CLIENT_ID missing' });
    if (!stripeKey) return res.status(500).json({ error: 'server_misconfigured', detail: 'STRIPE_SECRET_KEY missing' });

    const claims = await verifyGoogleIdToken(credential, clientId);
    const stripe = Stripe(stripeKey);

    // Find-or-create customer
    let customer;
    const existing = await stripe.customers.list({ email: claims.email, limit: 1 });
    customer = existing.data?.[0] || await stripe.customers.create({ email: claims.email, name: claims.name });

    const token = sign(
      { sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture, stripe_customer_id: customer.id },
      sessionSecret,
      { expiresIn: 60 * 60 * 24 * 30 }
    );

    setCookie(res, 'session', token, {
      Path: '/',
      HttpOnly: true,
      Secure: isHttps(req),   // false on http://localhost
      SameSite: 'Lax',        // set to 'None' if API and UI are on different sites and HTTPS
      MaxAge: 60 * 60 * 24 * 30
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[auth/google-verify] failed:', e);
    res.status(400).json({ error: 'auth_failed', detail: String(e && e.message || e) });
  }
};
