const { setCookie } = require('../_lib/cookies');
const { sign } = require('../_lib/jwt');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function verifyGoogleIdToken(idToken, clientId) {
  // Use tokeninfo for simplicity; for prod-scale consider google-auth-library
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`tokeninfo ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  if (data.aud !== clientId) throw new Error(`bad_audience: got ${data.aud}`);
  if (data.iss !== 'https://accounts.google.com' && data.iss !== 'accounts.google.com') {
    throw new Error(`bad_issuer: ${data.iss}`);
  }
  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture
  };
}

async function findOrCreateCustomerByEmail(email, name) {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data && existing.data.length) return existing.data[0];
  return await stripe.customers.create({ email, name });
}

function isHttps(req) {
  const xfProto = req.headers['x-forwarded-proto'];
  if (xfProto) return String(xfProto).split(',')[0].trim() === 'https';
  // Vercel/Node heuristic
  return !!(req.connection && req.connection.encrypted);
}

function isCrossSite(req) {
  // If your frontend and API are on the same origin, keep this false.
  // If you know they’re on different sites, flip to true or detect via header.
  // For most Vercel setups with same domain, leave as false.
  return false;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'missing_credential' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'server_misconfigured', detail: 'GOOGLE_CLIENT_ID missing' });

    const claims = await verifyGoogleIdToken(credential, clientId);
    const customer = await findOrCreateCustomerByEmail(claims.email, claims.name);

    const token = sign(
      {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
        stripe_customer_id: customer.id
      },
      process.env.SESSION_SECRET,
      { expiresIn: 60 * 60 * 24 * 30 }
    );

    const secure = isHttps(req);
    const crossSite = isCrossSite(req);

    setCookie(res, 'session', token, {
      Path: '/',
      HttpOnly: true,
      Secure: secure,                   // false on http://localhost
      SameSite: crossSite ? 'None' : 'Lax', // None for cross-site, Lax for same-site
      MaxAge: 60 * 60 * 24 * 30
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[auth/google-verify] failed:', e.message);
    res.status(400).json({ error: 'auth_failed', detail: e.message });
  }
};
