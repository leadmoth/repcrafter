// Creates a Stripe Checkout Session using a configured Price ID or inline price_data.
// Returns { url } on success or a JSON error with details on failure.

const { parseCookies } = require('./_lib/cookies');

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body !== 'string') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

function absoluteOrigin(req, fallback) {
  const xfProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const proto = xfProto || 'https';
  const host = req.headers.host || '';
  return fallback || `${proto}://${host}`;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    // Require Stripe SDK and key
    let Stripe;
    try { Stripe = require('stripe'); }
    catch {
      return res.status(500).json({ error: 'server_misconfigured', detail: "Stripe SDK not installed. Add 'stripe' to dependencies." });
    }
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(500).json({ error: 'server_misconfigured', detail: 'STRIPE_SECRET_KEY missing' });
    }
    const stripe = Stripe(stripeKey);

    const body = await readJsonBody(req);
    const returnTo = (body && body.returnTo) || absoluteOrigin(req);
    const success_url = `${returnTo}?paid=1`;
    const cancel_url = returnTo;

    // Optional: attach the email from your session cookie so Stripe can prefill
    let customer_email = undefined;
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      // If you store email in JWT, you could decode it here. For now we rely on client providing it later or Stripe Google Pay.
      // customer_email = decoded.email;
      // Keeping undefined is fine; Stripe will ask for email on Checkout.
    } catch {}

    // Prefer a pre-created Price ID; fallback to inline price_data if not set
    const priceId = process.env.STRIPE_PRICE_ID || body?.priceId;
    const line_items = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            unit_amount: 199, // $1.99 in cents
            product_data: { name: 'REPCRAFTER Access' }
          },
          quantity: 1
        }];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url,
      cancel_url,
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_email,
      // automatic_tax: { enabled: true }, // enable if needed
      // metadata: { app: 'repcrafter' },
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
