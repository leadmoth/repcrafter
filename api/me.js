// Reads the session cookie and reports auth/paid status.
// For subscriptions, it checks Stripe for an active/trialing subscription.

const { parseCookies } = require('./_lib/cookies');
const { verify } = require('./_lib/jwt');

function safeRequireStripe() {
  try { return require('stripe'); } catch { return null; }
}

module.exports = async (req, res) => {
  try {
    // Emergency bypass for debugging
    if (process.env.DISABLE_AUTH === '1') {
      return res.status(200).json({ authenticated: true, paid: true, bypass: true });
    }

    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.session;
    if (!token) {
      return res.status(200).json({ authenticated: false, paid: false });
    }

    let payload = null;
    try {
      payload = verify(token, process.env.SESSION_SECRET);
    } catch (e) {
      return res.status(200).json({ authenticated: false, paid: false, reason: e.message });
    }

    // Default to unpaid; flip to true if Stripe confirms subscription
    let paid = false;

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const Stripe = safeRequireStripe();
    const customerId = payload?.stripe_customer_id;

    if (Stripe && stripeKey && customerId) {
      try {
        const stripe = Stripe(stripeKey, { apiVersion: '2024-06-20' });
        // Check for any active or trialing subscription
        // Use one list call with status='all' to minimize round trips.
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 10
        });
        paid = subs.data.some((s) => s.status === 'active' || s.status === 'trialing');
      } catch (e) {
        console.warn('[api/me] stripe check failed:', e.message);
      }
    }

    res.status(200).json({
      authenticated: true,
      paid,
      email: payload.email || null,
      stripe_customer_id: customerId || null
    });
  } catch (e) {
    console.error('[api/me] failed:', e);
    res.status(500).json({ error: 'me_failed' });
  }
};
