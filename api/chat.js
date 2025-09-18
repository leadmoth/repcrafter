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

    // Parse incoming JSON robustly (may already be parsed by the platform)
    let body = req.body;
    if (body == null || typeof body !== 'object') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      body = raw ? JSON.parse(raw) : {};
    }

    // Normalize for n8n consumers
    const chatInput = body.chatInput ?? body.message ?? body.text ?? body.prompt ?? '';
    const payload = {
      chatInput,
      // Duplicate for nodes that expect "prompt"
      prompt: body.prompt ?? chatInput,
      sessionId: body.sessionId ?? body.session_id ?? undefined,
      history: body.history,
      metadata: body.metadata,
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const upstreamCT = upstream.headers.get('content-type') || '';
    let replyText = '';

    if (upstreamCT.includes('application/json')) {
      let data = null;
      try { data = await upstream.json(); } catch {}
      replyText =
        (data && (
          (typeof data.reply === 'string' && data.reply) ||
          (Array.isArray(data.messages) && data.messages.map(m => m?.text ?? m).filter(Boolean).join('\n')) ||
          (typeof data.text === 'string' && data.text) ||
          (typeof data.answer === 'string' && data.answer) ||
          (typeof data.output === 'string' && data.output) ||
          (typeof data.completion === 'string' && data.completion) ||
          (data?.choices?.[0]?.message?.content) ||
          (data?.choices?.[0]?.text) ||
          (typeof data.result === 'string' && data.result) ||
          (typeof data.response === 'string' && data.response)
        )) || '';
    } else {
      // Plain text or anything else
      try { replyText = await upstream.text(); } catch { replyText = ''; }
    }

    // Always normalize back to JSON for the browser
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify({ reply: replyText || '...' }));
  } catch (e) {
    console.error('Proxy error:', e);
    return res.status(500).json({ error: 'Proxy error' });
  }
}
