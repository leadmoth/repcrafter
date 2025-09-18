(function () {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('userInput');
  const messagesEl = document.getElementById('messages');
  const newChatBtn = document.getElementById('newChatBtn');

  const cfg = (window.REPCRAFTER_CONFIG || {});
  const WEBHOOK_URL = cfg.WEBHOOK_URL || '/api/chat';

  const params = new URLSearchParams(location.search);
  const RAW_MODE = params.get('raw') === '1' || !!cfg.RAW_MODE;
  const DEBUG = params.get('debug') === '1' || !!cfg.DEBUG;
  const FORCE_NEW = params.has('new'); // open ?new=1 to force a new session immediately

  function newSessionId() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  let sessionId = newSessionId();

  // If user navigates back/forward and the page comes from bfcache, force a hard reload.
  // This guarantees a fresh session on every visit.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      location.reload();
    }
  });

  // Optional: force a new session if ?new=1 is present
  if (FORCE_NEW) {
    sessionId = newSessionId();
  }

  // Manual "New chat" button: wipes messages and regenerates sessionId
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      sessionId = newSessionId();
      messagesEl.innerHTML = '';
      input.value = '';
      if (DEBUG) console.debug('[chat] New session started:', sessionId);
    });
  }

  function appendMessage(role, text) {
    // New structure using CSS classes in styles.css
    const li = document.createElement('li');
    li.className = `message ${role}`;

    const content = document.createElement('div');
    content.className = 'content';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = String(text ?? '');

    content.appendChild(bubble);
    li.appendChild(content);
    messagesEl.appendChild(li);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function truncate(s, n) {
    if (typeof s !== 'string') s = String(s ?? '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = (input.value || '').trim();
    if (!userText) return;

    appendMessage('user', userText);
    input.value = '';

    // Typing indicator
    appendMessage('bot', '…');

    try {
      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatInput: userText, sessionId })
      });

      const status = resp.status;
      const contentType = resp.headers.get('content-type') || '';
      const rawBody = await resp.text();

      if (DEBUG) {
        console.debug('[chat] sessionId:', sessionId);
        console.debug('[chat] upstream status:', status);
        console.debug('[chat] upstream content-type:', contentType);
        console.debug('[chat] upstream body (first 200):', truncate(rawBody, 200));
      }

      if (!resp.ok) {
        throw new Error(`Webhook error ${status}: ${truncate(rawBody, 240)}`);
      }

      let replyText = '';
      if (RAW_MODE) {
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
          rawBody;
      } else {
        replyText = rawBody;
      }

      // Replace last bot bubble
      const lastBot = messagesEl.querySelector('li.message.bot:last-of-type .bubble');
      if (lastBot) lastBot.textContent = replyText || '...';
    } catch (err) {
      const lastBot = messagesEl.querySelector('li.message.bot:last-of-type .bubble');
      if (lastBot) lastBot.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  });
})();
