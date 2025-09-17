# REPCRAFTER (barebones)

Minimal chat UI wired to your n8n AI agent via a Vercel proxy. No settings, no extra buttons.

- Frontend posts to `/api/chat`
- Vercel proxy forwards to your n8n webhook (supports JSON or plain text responses)
- First message:
  > Hey! 👋 I’m your AI coach. To build your workout plan, I’ll need to ask you a few quick questions. Ready?

## Deploy (Vercel)

1) Create a GitHub repo named `REPCRAFTER` and add these files.
2) In Vercel:
   - New Project → Import the repo
   - Framework preset: Other
   - Build command: (leave empty)
   - Output directory: (leave empty)
   - Environment variables:
     - `N8N_WEBHOOK_URL` = `https://your-n8n-host/webhook/your-path`
     - (Optional) `N8N_SHARED_SECRET` = `some-strong-string`
3) Deploy. Open the site and send a message.

## Testing your deployment

After deploying, test your setup:

1. **Health check**: Visit `https://your-domain.vercel.app/api/ping`
   - Should return `{"ok":true,"time":"...","env":{"hasWebhookUrl":true}}`
   - If `hasWebhookUrl` is `false`, add `N8N_WEBHOOK_URL` to your Vercel environment variables

2. **Chat functionality**: Send a test message on your site
   - If you get a 404 error, check these common issues:
     - Your n8n workflow is not active/deployed
     - The `N8N_WEBHOOK_URL` doesn't match your actual n8n webhook URL
     - Your n8n instance is not accessible from the internet

## Troubleshooting

**Common Issues:**

- **"404 Not Found" from n8n**: Your n8n workflow is inactive or the webhook URL is wrong
  - Solution: Activate your n8n workflow and verify the webhook URL matches `N8N_WEBHOOK_URL`

- **CORS errors**: You're calling n8n directly instead of using the proxy
  - Solution: Ensure `config.js` uses `"/api/chat"` not a direct n8n URL

- **"N8N_WEBHOOK_URL is not configured"**: Missing environment variable
  - Solution: Add `N8N_WEBHOOK_URL` in your Vercel project settings

**Testing commands:**
```bash
# Test health check
curl https://your-domain.vercel.app/api/ping

# Test chat proxy (should return n8n response or error)
curl -X POST https://your-domain.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test","sessionId":"test"}'
```

## n8n response format

- Plain text:
  - Set "Respond to Webhook" as text and `Content-Type: text/plain`.
- JSON (also supported):
  - `{ "reply": "..." }` or `{ "text": "..." }` or `{ "messages": [{ "text": "..." }] }`

## Local development

- You can run this as static files locally (no build step). For the proxy:
  - Use Vercel CLI or set `WEBHOOK_URL` directly in `config.js` to your n8n endpoint if testing without the proxy (ensure CORS on n8n).

## Security

- Prefer the `/api/chat` proxy. Validate `X-Shared-Secret` in your n8n workflow if you set `N8N_SHARED_SECRET`."# REPCRAFTER" 
