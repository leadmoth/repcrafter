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

  const GREETING = "Hey there! 👋 I’m REPCRAFTER. Ready to craft your workout plan?";

  function newSessionId() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }
  let sessionId = newSessionId();

  // Force fresh state if page is restored from bfcache
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

  function timeNow() {
    try { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function makeMessageEl(role, text, showMeta=true) {
    const li = document.createElement('li');
    li.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '🧑' : '🤖';

    const content = document.createElement('div');
    content.className = 'content';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (text instanceof Element) {
      bubble.appendChild(text);
    } else {
      bubble.textContent = String(text ?? '');
    }

    content.appendChild(bubble);

    if (showMeta) {
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = timeNow();
      content.appendChild(meta);
    }

    li.appendChild(avatar);
    li.appendChild(content);
    return { li, bubble };
  }

  function appendMessage(role, text, opts={}) {
    const { showMeta=true } = opts;
    const { li, bubble } = makeMessageEl(role, text, showMeta);
    messagesEl.appendChild(li);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return { li, bubble };
  }

  function showTyping() {
    const dots = document.createElement('div');
    dots.className = 'typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    return appendMessage('bot', dots);
  }

  function replaceBubbleContent(bubbleEl, newText) {
    if (!bubbleEl) return;
    bubbleEl.textContent = String(newText ?? '');
  }

  // New chat button: fresh session + greet
  function startNewChat() {
    sessionId = newSessionId();
    messagesEl.innerHTML = '';
    input.value = '';
    appendMessage('bot', GREETING);
    if (cfg.AUTOFOCUS !== false) input.focus();
    if (DEBUG) console.debug('[chat] New session started:', sessionId);
  }
  if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

  // Initial greeting on load
  startNewChat();

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  // Enter-to-send: input handler (Shift+Enter = newline, IME-safe)
  let composing = false;
  input.addEventListener('compositionstart', () => composing = true);
  input.addEventListener('compositionend', () => composing = false);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !composing) {
      e.preventDefault();
      if (form) (form.requestSubmit ? form.requestSubmit() : form.submit());
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = (input.value || '').trim();
    if (!userText) return;

    appendMessage('user', userText);
    input.value = '';
    input.style.height = '42px';

    const typing = showTyping();

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
        console.debug('[chat] upstream body (first 200):', (rawBody || '').slice(0, 200));
      }

      if (!resp.ok) throw new Error(`Webhook error ${status}: ${rawBody}`);

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
          (typeof data === 'string' && data) ||
          rawBody;
      } else {
        replyText = rawBody;
      }

      replaceBubbleContent(typing.bubble, replyText || '...');
    } catch (err) {
      replaceBubbleContent(typing.bubble, `Error: ${err.message}`);
      console.error(err);
    }
  });
})();
