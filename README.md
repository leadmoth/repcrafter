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

## n8n response format

- Plain text:
  - Set "Respond to Webhook" as text and `Content-Type: text/plain`.
- JSON (also supported):
  - `{ "reply": "..." }` or `{ "text": "..." }` or `{ "messages": [{ "text": "..." }] }`

## Local development

- You can run this as static files locally (no build step). For the proxy:
  - Use Vercel CLI or set `WEBHOOK_URL` directly in `config.js` to your n8n endpoint if testing without the proxy (ensure CORS on n8n).

## Security

- Prefer the `/api/chat` proxy. Validate `X-Shared-Secret` in your n8n workflow if you set `N8N_SHARED_SECRET`.