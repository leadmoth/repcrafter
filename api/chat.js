// Proxies chat requests to your n8n webhook and always returns a JSON response.
//
// Env:
//   N8N_CHAT_WEBHOOK_URL - full Production URL of your n8n Webhook node
//   N8N_BASIC_USER / N8N_BASIC_PASS (optional; if your n8n webhook uses Basic Auth)
//   SESSION_SECRET - to extract user info from the JWT

const https = require('https');
const http = require('http');
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

function basicAuthHeader(user, pass) {
  if (!user || !pass) return null;
  const token = Buffer.from(`${user}:${pass}`).toString('base64');
  return `Basic ${token}`;
}

function fetchJsonWithNode(urlString, options = {}, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlString); } catch (e) { return reject(new Error(`bad_url: ${e.message}`)); }
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request({
      method: options.method || 'POST',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + (url.search || ''),
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: data, headers: res.headers }));
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

module.exports = async (req, res) => {
  const startedAt = Date.now();
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).end();

    const n8nUrl = process.env.N8N_CHAT_WEBHOOK_URL;
    if (!n8nUrl) {
      console.error('[api/chat] missing N8N_CHAT_WEBHOOK_URL');
      return res.status(500).json({ error: 'server_misconfigured', detail: 'N8N_CHAT_WEBHOOK_URL missing' });
    }

    const body = await readJsonBody(req);

    // Extract minimal user context from session
    let user = {};
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies.session;
      if (token && process.env.SESSION_SECRET) {
        const payload = verify(token, process.env.SESSION_SECRET);
        user = {
          id: payload?.sub,
          email: payload?.email,
          stripe_customer_id: payload?.stripe_customer_id
        };
      }
    } catch (e) {
      console.warn('[api/chat] session decode failed:', e.message);
    }

    const payload = { ...body, user };

    const headers = { 'Content-Type': 'application/json' };
    const basic = basicAuthHeader(process.env.N8N_BASIC_USER, process.env.N8N_BASIC_PASS);
    if (basic) headers.Authorization = basic;
    headers['X-APP'] = 'repcrafter';
    if (user.id) headers['X-User-Id'] = String(user.id);
    if (user.email) headers['X-User-Email'] = String(user.email);

    console.log('[api/chat] forwarding to n8n', {
      urlHost: (() => { try { return new URL(n8nUrl).host; } catch { return null; } })(),
      hasAuth: Boolean(basic),
      bodyKeys: Object.keys(body || {}),
      userPresent: Boolean(user && (user.id || user.email))
    });

    // Call n8n (using Node's http/https to avoid any global fetch/runtime issues)
    const resp = await fetchJsonWithNode(n8nUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    // Log non-2xx for diagnostics
    if (resp.status < 200 || resp.status >= 300) {
      console.warn('[api/chat] n8n responded non-2xx', { status: resp.status, len: resp.text?.length });
      return res.status(502).json({
        error: 'n8n_failed',
        status: resp.status,
        detail: (resp.text || '').slice(0, 2000)
      });
    }

    // Try JSON first
    try {
      const json = JSON.parse(resp.text || '{}');
      return res.status(200).json(json);
    } catch {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(resp.text || '');
    }
  } catch (e) {
    console.error('[api/chat] failed:', e);
    return res.status(500).json({ error: 'chat_failed', detail: e?.message || String(e) });
  } finally {
    console.log('[api/chat] done in ms', Date.now() - startedAt);
  }
};
