// Vercel Serverless Function: Proxies chat requests to your n8n webhook.
// Set Vercel env var N8N_WEBHOOK_URL to your full webhook URL.
// Optional: set N8N_SHARED_SECRET and validate it in your n8n workflow.

export default async function handler(req, res) {
  // Basic CORS support if you ever call this from another origin.
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Shared-Secret');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const upstreamUrl = process.env.N8N_WEBHOOK_URL;
  if (!upstreamUrl) return res.status(500).json({ error: 'N8N_WEBHOOK_URL is not configured' });

  try {
    const rawBody = await readBody(req);
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain;q=0.8, */*;q=0.5' };
    const shared = process.env.N8N_SHARED_SECRET || '';
    if (shared) headers['X-Shared-Secret'] = shared;

    const upstreamResp = await fetch(upstreamUrl, { method: 'POST', headers, body: rawBody || '{}' });

    // Forward status + content-type + body as-is so plain text works fine.
    const contentType = upstreamResp.headers.get('content-type') || 'text/plain';
    const text = await upstreamResp.text();
    res.status(upstreamResp.status);
    res.setHeader('Content-Type', contentType);
    return res.send(text);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Proxy error', detail: String(err?.message || err) });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}