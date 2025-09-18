const { setCookie } = require('../_lib/cookies');
const { sign } = require('../_lib/jwt');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function verifyGoogleIdToken(idToken, clientId) {
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!resp.ok) throw new Error('tokeninfo failed');
  const data = await resp.json();
  if (data.aud !== clientId) throw new Error('bad audience');
  if (data.iss !== 'https://accounts.google.com' && data.iss !== 'accounts.google.com') throw new Error('bad issuer');
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

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'missing_credential' });

    const claims = await verifyGoogleIdToken(credential, process.env.GOOGLE_CLIENT_ID);
    const customer = await findOrCreateCustomerByEmail(claims.email, claims.name);

    const token = sign({
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
      stripe_customer_id: customer.id
    }, process.env.SESSION_SECRET, { expiresIn: 60 * 60 * 24 * 30 }); // 30 days

    setCookie(res, 'session', token, {
      Path: '/',
      HttpOnly: true,
      Secure: true,
      SameSite: 'Lax',
      MaxAge: 60 * 60 * 24 * 30
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'auth_failed' });
  }
};