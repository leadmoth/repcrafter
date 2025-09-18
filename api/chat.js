const { parseCookies } = require('./_lib/cookies');
const { verify } = require('./_lib/jwt');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    // 1) Auth
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.session || '';
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    let sess;
    try { sess = verify(token, process.env.SESSION_SECRET); }
    catch { return res.status(401).json({ error: 'unauthorized' }); }

    // 2) Payment check
    const customer = sess.stripe_customer_id;
    if (!customer) return res.status(402).json({ error: 'payment_required' });
    const intents = await stripe.paymentIntents.list({ customer, limit: 10 });
    const paid = intents.data.some(pi => pi.status === 'succeeded' && pi.metadata && pi.metadata.product === 'rep199');
    if (!paid) return res.status(402).json({ error: 'payment_required' });

    // 3) Proxy to n8n webhook
    const upstream = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });

    const contentType = upstream.headers.get('content-type') || '';
    const bodyText = await upstream.text();

    res.status(upstream.status);
    if (contentType.includes('application/json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(bodyText);
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(bodyText);
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'chat_proxy_failed' });
  }
};
