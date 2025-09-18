export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    env: { hasWebhookUrl: Boolean(process.env.N8N_WEBHOOK_URL) },
    time: new Date().toISOString(),
  });
}
