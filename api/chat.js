export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Shared-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const target = process.env.N8N_WEBHOOK_URL;
  if (!target) return res.status(500).json({ error: 'Missing N8N_WEBHOOK_URL' });

  try {
    // Read JSON body robustly
    let body = req.body;
    if (body == null || typeof body !== 'object') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      body = raw ? JSON.parse(raw) : {};
    }

    // Send both camelCase and snake_case to satisfy n8n memory nodes
    const payload = {
      chatInput: body.chatInput ?? body.prompt ?? body.text ?? '',
      prompt: body.prompt ?? body.chatInput ?? body.text ?? '',
      sessionId: body.sessionId ?? body.session_id,
      session_id: body.sessionId ?? body.session_id,
      history: body.history,
      metadata: body.metadata,
    };

    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_SHARED_SECRET ? { 'X-Shared-Secret': process.env.N8N_SHARED_SECRET } : {}),
      },
      body: JSON.stringify(payload),
    });

    const upstreamCT = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    const text = await upstream.text();

    // Passthrough exact response
    res.status(upstream.status);
    res.setHeader('Content-Type', upstreamCT);
    return res.send(text);
  } catch (e) {
    console.error('Proxy error:', e);
    return res.status(500).json({ error: 'Proxy error' });
  }
}
