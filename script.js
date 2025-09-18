(function () {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('userInput');
  const messagesEl = document.getElementById('messages');

  const cfg = (window.REPCRAFTER_CONFIG || {});
  const WEBHOOK_URL = cfg.WEBHOOK_URL || '/api/chat';

  // Enable "show exactly what the server returned" with either:
  // - URL param ?raw=1
  // - window.REPCRAFTER_CONFIG.RAW_MODE = true
  const params = new URLSearchParams(location.search);
  const RAW_MODE = params.get('raw') === '1' || !!cfg.RAW_MODE;

  // Extra console logging when ?debug=1 or config.DEBUG = true
  const DEBUG = params.get('debug') === '1' || !!cfg.DEBUG;

  function appendMessage(role, text) {
    const li = document.createElement('li');
    li.className = `msg msg-${role}`;
    li.textContent = String(text ?? '');
    messagesEl.appendChild(li);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function truncate(s, n) {
    if (typeof s !== 'string') s = String(s ?? '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function newSessionId() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }
  let sessionId = newSessionId();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = (input.value || '').trim();
    if (!userText) return;

    appendMessage('user', userText);
    input.value = '';
    appendMessage('bot', '…');

    try {
      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatInput: userText, sessionId })
      });

      const status = resp.status;
      const contentType = resp.headers.get('content-type') || '';
      const rawBody = await resp.text(); // read once, parse from this if needed

      if (DEBUG) {
        console.debug('[chat] upstream status:', status);
        console.debug('[chat] upstream content-type:', contentType);
        console.debug('[chat] upstream body (first 200):', truncate(rawBody, 200));
      }

      if (!resp.ok) {
        throw new Error(`Webhook error ${status}: ${truncate(rawBody, 240)}`);
      }

      let replyText = '';

      if (RAW_MODE) {
        // Show exactly what the server sent (JSON string or plain text)
        replyText = rawBody;
      } else if (contentType.includes('application/json')) {
        let data;
        try { data = rawBody ? JSON.parse(rawBody) : {}; } catch { data = {}; }
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
          rawBody; // fallback: show raw JSON string
      } else {
        // Non-JSON: show as-is
        replyText = rawBody;
      }

      const lastBot = messagesEl.querySelector('li.msg-bot:last-of-type');
      if (lastBot) lastBot.textContent = replyText || '...';
    } catch (err) {
      const lastBot = messagesEl.querySelector('li.msg-bot:last-of-type');
      if (lastBot) lastBot.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  });
})();
