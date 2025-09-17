export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-shared-secret');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return res.status(500).json({ error: 'Missing N8N_WEBHOOK_URL' });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.N8N_SHARED_SECRET) headers['X-Shared-Secret'] = process.env.N8N_SHARED_SECRET;

    // req.body is usually populated by Vercel for JSON requests, but fall back to manual parse if needed
    let body = req.body;
    if (body == null) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      body = raw ? JSON.parse(raw) : {};
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });

    const text = await resp.text();
    res.status(resp.status);
    res.setHeader('Content-Type', resp.headers.get('content-type') || 'text/plain');
    return res.send(text);
  } catch (e) {
    console.error('Proxy error:', e);
    return res.status(500).json({ error: 'Proxy error' });
  }
}
