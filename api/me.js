const { parseCookies } = require('./_lib/cookies');
const { verify } = require('./_lib/jwt');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.session || '';
    if (!token) return res.status(200).json({ authenticated: false, paid: false });

    let sess;
    try { sess = verify(token, process.env.SESSION_SECRET); }
    catch { return res.status(200).json({ authenticated: false, paid: false }); }

    const customer = sess.stripe_customer_id;
    let paid = false;
    if (customer) {
      const intents = await stripe.paymentIntents.list({ customer, limit: 10 });
      paid = intents.data.some(pi => pi.status === 'succeeded' && pi.metadata && pi.metadata.product === 'rep199');
    }

    res.status(200).json({
      authenticated: true,
      paid,
      email: sess.email || null,
      name: sess.name || null
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ authenticated: false, paid: false, error: 'me_failed' });
  }
};
