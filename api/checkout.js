// Creates a Stripe Checkout Session that automatically matches mode to the price type.
// - If STRIPE_PRICE_ID is a recurring price -> mode: 'subscription'.
// - If STRIPE_PRICE_ID is a one-time price -> mode: 'payment'.
// - If no price is configured, falls back to inline one-time price_data.
// Optional: you can pass { priceId } or { interval: 'month'|'year' } in the POST body.

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

    // Optional: extract email from your session cookie for Stripe prefill
    let customer_email;
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies.session;
      if (token && process.env.SESSION_SECRET) {
        const payload = verify(token, process.env.SESSION_SECRET);
        if (payload?.email) customer_email = payload.email;
      }
    } catch {}

    const envPriceId = process.env.STRIPE_PRICE_ID;
    const reqPriceId = body?.priceId;
    const priceId = envPriceId || reqPriceId;

    let mode = 'payment';
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
      // Fallback inline price: one-time by default, or subscription if an interval is provided
      const interval = body?.interval; // 'month' | 'year'
      if (interval === 'month' || interval === 'year') {
        mode = 'subscription';
        line_items = [{
          price_data: {
            currency: 'usd',
            unit_amount: 199, // $1.99
            product_data: { name: 'REPCRAFTER Access' },
            recurring: { interval }
          },
          quantity: 1
        }];
      } else {
        mode = 'payment';
        line_items = [{
          price_data: {
            currency: 'usd',
            unit_amount: 199, // $1.99
            product_data: { name: 'REPCRAFTER Access' }
          },
          quantity: 1
        }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      success_url,
      cancel_url,
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_email
      // For subscriptions you can also pass:
      // subscription_data: { trial_from_plan: true }
    });

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
