(function () {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('userInput');
  const messagesEl = document.getElementById('messages');
  const WEBHOOK_URL = (window.REPCRAFTER_CONFIG && window.REPCRAFTER_CONFIG.WEBHOOK_URL) || '/api/chat';

  function appendMessage(role, text) {
    const li = document.createElement('li');
    li.className = `msg msg-${role}`;
    li.textContent = text;
    messagesEl.appendChild(li);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function truncate(s, n) {
    if (typeof s !== 'string') s = String(s ?? '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  async function safeText(resp) {
    try { return await resp.text(); } catch { return ''; }
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

      // Replace the last bot placeholder message with real text
      const lastBot = messagesEl.querySelector('li.msg-bot:last-of-type');
      if (lastBot) lastBot.textContent = replyText || '...';
    } catch (err) {
      const lastBot = messagesEl.querySelector('li.msg-bot:last-of-type');
      if (lastBot) lastBot.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  });
})();
