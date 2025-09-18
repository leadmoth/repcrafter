// ...inside onSubmit after const resp = await fetch(...)
const contentType = resp.headers.get('content-type') || '';
if (!resp.ok) {
  const errText = await safeText(resp);
  throw new Error(`Webhook error ${resp.status}: ${truncate(errText, 240)}`);
}

let replyText = '';
if (contentType.includes('application/json')) {
  const data = await resp.json();
  replyText =
    (typeof data.reply === 'string' && data.reply) ||
    (Array.isArray(data.messages) && data.messages.map(m => m?.text ?? m).filter(Boolean).join('\n')) ||
    (typeof data.text === 'string' && data.text) ||
    (typeof data.answer === 'string' && data.answer) ||
    (typeof data.output === 'string' && data.output) ||
    (typeof data.completion === 'string' && data.completion) ||
    (data?.choices?.[0]?.message?.content) ||
    (data?.choices?.[0]?.text) ||
    (typeof data.result === 'string' && data.result) ||
    (typeof data.response === 'string' && data.response) ||
    (typeof data === 'string' && data) ||
    JSON.stringify(data);
} else {
  replyText = await resp.text();
}
