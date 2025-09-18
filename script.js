(function () {
  const els = {
    messages: document.getElementById('messages'),
    form: document.getElementById('chatForm'),
    input: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
  };

  const state = {
    sessionId: loadOrCreate('rep_session_id', () => uuidv4()),
    webhookUrl: (window.REPCRAFTER_CONFIG && window.REPCRAFTER_CONFIG.WEBHOOK_URL) || '/api/chat',
    history: loadFromLocalStorage('rep_chat_history', []),
    pending: false,
  };

  init();

  function init() {
    // Render persisted history
    if (Array.isArray(state.history) && state.history.length) {
      for (const msg of state.history.slice(-50)) renderMessage(msg);
    }

    // Intro message (always show if this is a new session or last message wasn't this intro)
    if (!state.history.length || !isIntro(state.history[0])) {
      const intro = {
        role: 'bot',
        text: 'Hey! 👋 I’m your AI coach. To build your workout plan, I’ll need to ask you a few quick questions. Ready?',
        ts: Date.now(),
      };
      state.history.unshift(intro);
      renderMessage(intro, true);
      persistHistory();
    }

    autosizeTextarea(els.input);

    els.form.addEventListener('submit', onSubmit);
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        els.form.requestSubmit();
      }
    });
  }

  function isIntro(msg) {
    return msg && msg.role === 'bot' && typeof msg.text === 'string' &&
      msg.text.startsWith('Hey! 👋 I’m your AI coach.');
  }

  async function onSubmit(e) {
    e.preventDefault();
    const text = (els.input.value || '').trim();
    if (!text || state.pending) return;

    const userMsg = { role: 'user', text, ts: Date.now() };
    appendAndRender(userMsg);
    els.input.value = '';
    autosizeTextarea(els.input);

    const typingId = renderTyping();

    try {
      state.pending = true;
      els.sendBtn.disabled = true;

     // inside onSubmit(), replace the payload with:
const payload = {
  sessionId: state.sessionId,
  chatInput: text,               // IMPORTANT: Chat Trigger expects this key
  history: lastHistory(12),
  metadata: {
    source: 'repCrafter-web',
    userAgent: navigator.userAgent,
    locale: navigator.language || '',
    page: location.href,
  },
};
      };

      let replyText = '';
      const resp = await fetch(state.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain;q=0.8, */*;q=0.5',
        },
        body: JSON.stringify(payload),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok) {
        const errText = await safeText(resp);
        throw new Error(`Webhook error ${resp.status}: ${truncate(errText, 240)}`);
      }

      if (contentType.includes('application/json')) {
        const data = await resp.json();
        if (typeof data.reply === 'string') replyText = data.reply;
        else if (Array.isArray(data.messages)) replyText = data.messages.map(m => m.text ?? m).join('\n');
        else if (typeof data.text === 'string') replyText = data.text;
        else replyText = 'OK';
      } else {
        replyText = await resp.text();
      }

      removeTyping(typingId);
      appendAndRender({ role: 'bot', text: replyText || '...', ts: Date.now() });
    } catch (err) {
      console.error(err);
      removeTyping(typingId);
      appendAndRender({
        role: 'bot',
        text: `Sorry, I ran into an error contacting the webhook.\n\n${err.message}`,
        ts: Date.now(),
      });
    } finally {
      state.pending = false;
      els.sendBtn.disabled = false;
    }
  }

  function appendAndRender(msg) {
    state.history.push(msg);
    renderMessage(msg);
    persistHistory();
  }

  function renderMessage(msg, prepend = false) {
    const li = document.createElement('li');
    li.className = `message ${msg.role}`;
    li.innerHTML = `
      <div class="content">
        <div class="bubble">${escapeHtml(msg.text || '')}</div>
        <div class="meta">${new Date(msg.ts || Date.now()).toLocaleTimeString()}</div>
      </div>
    `;
    if (prepend) els.messages.prepend(li);
    else els.messages.appendChild(li);
    scrollToBottom();
  }

  function renderTyping() {
    const id = 'typing-' + Math.random().toString(36).slice(2);
    const li = document.createElement('li');
    li.className = 'message bot';
    li.id = id;
    li.innerHTML = `
      <div class="content">
        <div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>
        <div class="meta">Thinking…</div>
      </div>
    `;
    els.messages.appendChild(li);
    scrollToBottom();
    return id;
  }

  function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function lastHistory(n) {
    return state.history.slice(-n).map(m => ({ role: m.role, text: m.text, ts: m.ts }));
  }

  function persistHistory() {
    saveToLocalStorage('rep_chat_history', state.history.slice(-100));
  }

  // Utils
  function loadOrCreate(key, factory) {
    let v = localStorage.getItem(key);
    if (!v) { v = factory(); localStorage.setItem(key, v); }
    return v;
  }
  function loadFromLocalStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function saveToLocalStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function scrollToBottom() {
    els.messages.parentElement?.scrollTo({ top: els.messages.scrollHeight, behavior: 'smooth' });
  }
  function escapeHtml(s) {
    return (s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function autosizeTextarea(el) {
    const resize = () => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    };
    el.addEventListener('input', resize);
    resize();
  }
  function uuidv4() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  async function safeText(resp){ try{ return await resp.text(); } catch { return ''; } }
  function truncate(s, n){ if (!s) return s; return s.length > n ? s.slice(0, n-1) + '…' : s; }
})();
