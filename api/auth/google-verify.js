// Verifies Google ID token without fetch (using https), creates/fetches Stripe Customer,
// and sets a session cookie. Returns detailed errors for easier debugging.

const https = require('https');
const { setCookie } = require('../_lib/cookies');
const { sign } = require('../_lib/jwt');
const Stripe = require('stripe');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`tokeninfo ${res.statusCode}: ${data}`));
          }
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function verifyGoogleIdToken(idToken, clientId) {
  if (!idToken) throw new Error('missing_credential');
  if (!clientId) throw new Error('server_misconfigured: GOOGLE_CLIENT_ID missing');
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const data = await getJSON(url);
  if (data.aud !== clientId) throw new Error(`bad_audience: expected ${clientId} got ${data.aud}`);
  if (data.iss !== 'https://accounts.google.com' && data.iss !== 'accounts.google.com') {
    throw new Error(`bad_issuer: ${data.iss}`);
  }
  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}

function isHttps(req) {
  const xfProto = req.headers['x-forwarded-proto'];
  if (xfProto) return String(xfProto).split(',')[0].trim() === 'https';
  return !!(req.connection && req.connection.encrypted);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    const { credential } = req.body || {};
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const sessionSecret = process.env.SESSION_SECRET;
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!sessionSecret) {
      return res.status(500).json({ error: 'server_misconfigured', detail: 'SESSION_SECRET missing' });
    }
    if (!clientId) {
      return res.status(500).json({ error: 'server_misconfigured', detail: 'GOOGLE_CLIENT_ID missing' });
    }
    if (!stripeKey) {
      return res.status(500).json({ error: 'server_misconfigured', detail: 'STRIPE_SECRET_KEY missing' });
    }

    const claims = await verifyGoogleIdToken(credential, clientId);

    const stripe = Stripe(stripeKey);
    // Find or create Stripe customer by email
    let customer;
    const existing = await stripe.customers.list({ email: claims.email, limit: 1 });
    if (existing.data && existing.data.length) customer = existing.data[0];
    else customer = await stripe.customers.create({ email: claims.email, name: claims.name });

    const token = sign(
      {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
        stripe_customer_id: customer.id,
      },
      sessionSecret,
      { expiresIn: 60 * 60 * 24 * 30 } // 30 days
    );

    setCookie(res, 'session', token, {
      Path: '/',
      HttpOnly: true,
      Secure: isHttps(req), // false on http://localhost
      SameSite: 'Lax',      // if API and UI are same-site. Change to 'None' if cross-site and HTTPS.
      MaxAge: 60 * 60 * 24 * 30,
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[auth/google-verify] failed:', e);
    // Return detailed message so the client can show it
    res.status(400).json({ error: 'auth_failed', detail: String(e && e.message || e) });
  }
};
