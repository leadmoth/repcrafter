const { parseCookies } = require('./_lib/cookies');
const { verify } = require('./_lib/jwt');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.session || '';
    if (!token) return res.status(401).json({ error: 'unauthorized' });

    let sess;
    try { sess = verify(token, process.env.SESSION_SECRET); }
    catch { return res.status(401).json({ error: 'unauthorized' }); }

    const customer = sess.stripe_customer_id;
    const returnTo = (req.body && req.body.returnTo) || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer,
      client_reference_id: sess.sub,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${returnTo}/?paid=1`,
      cancel_url: `${returnTo}/`,
      payment_intent_data: {
        metadata: { product: 'rep199', user: sess.sub }
      }
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'checkout_failed' });
  }
};
