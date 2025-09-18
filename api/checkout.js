// Creates a Stripe Checkout Session that automatically matches mode to the price type.
// - If STRIPE_PRICE_ID is a recurring price -> mode: 'subscription'.
// - If STRIPE_PRICE_ID is a one-time price -> mode: 'payment'.
// - If no price is configured, defaults to a $2.99/month subscription.
// Optional: you can pass { priceId } or { interval: 'month'|'year', returnTo } in the POST body.

const { parseCookies } = require('./_lib/cookies');
const { verify } = require('./_lib/jwt');

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body !== 'string') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

function absoluteOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0].trim();
  const host = req.headers.host || '';
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    // Load Stripe
    let Stripe;
    try { Stripe = require('stripe'); }
    catch { return res.status(500).json({ error: 'server_misconfigured', detail: "Stripe SDK not installed. Add 'stripe' to dependencies." }); }
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ error: 'server_misconfigured', detail: 'STRIPE_SECRET_KEY missing' });
    const stripe = Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const body = await readJsonBody(req);
    const returnTo = body?.returnTo || absoluteOrigin(req);
    const success_url = `${returnTo}?paid=1`;
    const cancel_url = returnTo;

    // Extract user from session (prefill email / bind to customer)
    let customer_email;
    let stripe_customer_id;
    let user_id; // e.g., Google sub
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies.session;
      if (token && process.env.SESSION_SECRET) {
        const payload = verify(token, process.env.SESSION_SECRET);
        if (payload?.email) customer_email = payload.email;
        if (payload?.stripe_customer_id) stripe_customer_id = payload.stripe_customer_id;
        if (payload?.sub) user_id = payload.sub;
      }
    } catch {}

    // Determine line items and mode: default to $2.99/month subscription
    const envPriceId = process.env.STRIPE_PRICE_ID;
    const reqPriceId = body?.priceId;
    const priceId = envPriceId || reqPriceId;

    let mode = 'subscription';
    let line_items;

    if (priceId) {
      // Inspect the Price to determine if it's one-time or recurring
      const price = await stripe.prices.retrieve(priceId);
      if (!price?.active) {
        return res.status(400).json({ error: 'checkout_failed', detail: `Stripe price ${priceId} is not active` });
      }
      mode = price.type === 'recurring' ? 'subscription' : 'payment';
      line_items = [{ price: price.id, quantity: 1 }];
    } else {
      // Default: $2.99/month subscription
      const interval = body?.interval || 'month';
      mode = 'subscription';
      line_items = [{
        price_data: {
          currency: 'usd',
          unit_amount: 299, // $2.99
          product_data: { name: 'REPCRAFTER Access' },
          recurring: { interval } // 'month' by default
        },
        quantity: 1
      }];
    }

    const params = {
      mode,
      success_url,
      cancel_url,
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: 'auto'
    };

    // Prefer binding to known Customer; fall back to email prefill
    if (stripe_customer_id) {
      params.customer = stripe_customer_id;
      // params.customer_creation = 'if_required';
    } else if (customer_email) {
      params.customer_email = customer_email;
      // params.customer_creation = 'if_required';
    }

    if (user_id) params.client_reference_id = user_id;

    const session = await stripe.checkout.sessions.create(params);

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[api/checkout] failed:', e);
    const status = e?.statusCode && Number.isInteger(e.statusCode) ? e.statusCode : 400;
    return res.status(status).json({
      error: 'checkout_failed',
      detail: e?.message || String(e),
      stripe_request_id: e?.requestId,
      stripe_param: e?.param
    });
  }
};
