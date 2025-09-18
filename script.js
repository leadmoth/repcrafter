(function () {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('userInput');
  const messagesEl = document.getElementById('messages');
  const newChatBtn = document.getElementById('newChatBtn');
  const signOutBtn = document.getElementById('signOutBtn'); // Added for sign out

  const authModal = document.getElementById('authModal');
  const gsiContainer = document.getElementById('gsiContainer');
  const authClose = document.getElementById('authClose');
  const payModal = document.getElementById('payModal');
  const payBtn = document.getElementById('payBtn');
  // payClose removed

  const cfg = (window.REPCRAFTER_CONFIG || {});
  const WEBHOOK_URL = cfg.WEBHOOK_URL || '/api/chat';
  const GOOGLE_CLIENT_ID = cfg.GOOGLE_CLIENT_ID;

  const params = new URLSearchParams(location.search);
  const DEBUG = params.get('debug') === '1' || !!cfg.DEBUG;

  const GREETING = "Hey there! 👋 I’m REPCRAFTER. Ready to craft your workout plan? Tell me your goal to get started.";

  function safeRandomHex(len) {
    try {
      if (window.crypto?.getRandomValues) {
        const arr = new Uint8Array(Math.ceil(len / 2));
        window.crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
      }
    } catch {}
    let out = '';
    while (out.length < len) out += Math.floor(Math.random() * 16).toString(16);
    return out.slice(0, len);
  }
  function newSessionId() {
    return `${safeRandomHex(8)}-${safeRandomHex(4)}-${safeRandomHex(4)}-${safeRandomHex(4)}-${safeRandomHex(12)}`;
  }
  let sessionId = null;

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
    if (text instanceof Element) bubble.appendChild(text);
    else bubble.textContent = String(text ?? '');

    content.appendChild(bubble);

    if (showMeta) {
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = timeNow();
      content.appendChild(meta);
    }

    li.appendChild(avatar);
    li.appendChild(content);
    messagesEl.appendChild(li);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return { li, bubble };
  }

  function showTyping() {
    const dots = document.createElement('div');
    dots.className = 'typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    return makeMessageEl('bot', dots);
  }

  function replaceBubbleContent(bubbleEl, newText) {
    if (!bubbleEl) return;
    bubbleEl.textContent = String(newText ?? '');
  }

  function startNewChat() {
    try {
      if (!sessionId) sessionId = newSessionId();
      messagesEl.innerHTML = '';
      input.value = '';
      makeMessageEl('bot', GREETING);
      input.focus();
      if (DEBUG) console.debug('[chat] New session started:', sessionId);
    } catch (e) {
      console.error('[startNewChat] failed:', e);
    }
  }
  if (newChatBtn) newChatBtn.addEventListener('click', () => {
    sessionId = newSessionId();
    startNewChat();
  });

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        location.reload();
      } catch (e) {
        console.error('Sign out failed:', e);
        alert('Could not sign out. Please try again.');
      }
    });
  }

  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  let composing = false;
  input?.addEventListener('compositionstart', () => composing = true);
  input?.addEventListener('compositionend', () => composing = false);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !composing) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  });

  let authed = false;
  let paid = false;

  function setComposerEnabled(enabled) {
    try {
      if (input) input.disabled = !enabled;
      const sendBtn = form?.querySelector('#sendBtn');
      if (sendBtn) sendBtn.disabled = !enabled;
      if (input) {
        input.placeholder = enabled
          ? "Type your answer… (Enter to send, Shift+Enter for newline)"
          : (authed ? "Please complete payment to continue…" : "Please sign in to continue…");
      }
    } catch (e) {
      console.error('[setComposerEnabled] failed:', e);
    }
  }

  async function fetchMe() {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) throw new Error('me failed');
    return res.json();
  }

  function showAuthModal() { if (authModal) authModal.hidden = false; }
  function hideAuthModal() { if (authModal) authModal.hidden = true; }
  function showPayModal() { if (payModal) payModal.hidden = false; }
  function hidePayModal() { if (payModal) payModal.hidden = true; }

  function initializeGSI() {
    try {
      if (!window.google || !GOOGLE_CLIENT_ID) return;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp) => {
          try {
            const verify = await fetch('/api/auth/google-verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ credential: resp.credential })
            });
            const data = await verify.json().catch(() => ({}));
            if (!verify.ok) {
              const reason = data && (data.detail || data.error) ? `${data.error}: ${data.detail || ''}` : 'auth verify failed';
              throw new Error(reason);
            }
            hideAuthModal();
            await gate();
          } catch (e) {
            console.error(e);
            alert(`Sign-in failed: ${e.message}`);
          }
        },
        ux_mode: 'popup',
        auto_select: false
      });
      if (gsiContainer) {
        gsiContainer.innerHTML = '';
        google.accounts.id.renderButton(gsiContainer, { theme: 'outline', size: 'large', type: 'standard', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: 260 });
      }
    } catch (e) {
      console.error('[initializeGSI] failed:', e);
    }
  }

  async function gate() {
    try {
      if (cfg.BYPASS_AUTH === true || cfg.REQUIRE_AUTH === false) {
        authed = true; paid = true;
        hideAuthModal(); hidePayModal();
        setComposerEnabled(true);
        return;
      }

      const me = await fetchMe();
      authed = !!me.authenticated;
      paid = !!me.paid;

      if (!authed) {
        setComposerEnabled(false);
        showAuthModal();
        return;
      }
      hideAuthModal();

      if (!paid) {
        setComposerEnabled(false);
        showPayModal();
        return;
      }
      hidePayModal();
      setComposerEnabled(true);
    } catch (e) {
      console.error('[gate] failed:', e);
      setComposerEnabled(false);
      if (cfg.REQUIRE_AUTH !== false) showAuthModal();
    }
  }

  authClose?.addEventListener('click', hideAuthModal);
  // payClose removed; pay modal can't be dismissed

  payBtn?.addEventListener('click', async () => {
    try {
      const origin = location.origin;
      const res = await fetch('/api/checkout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnTo: origin }) });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Failed to start checkout');
      location.href = data.url;
    } catch (e) {
      console.error(e);
      alert('Could not start checkout. Try again.');
    }
  });

  if (params.get('paid') === '1') {
    (async () => { await gate(); })();
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!authed) { showAuthModal(); return; }
    if (!paid) { showPayModal(); return; }

    const userText = (input.value || '').trim();
    if (!userText) return;

    makeMessageEl('user', userText);
    input.value = '';
    input.style.height = '42px';

    const typing = showTyping();

    try {
      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatInput: userText, sessionId: sessionId || (sessionId = newSessionId()) })
      });

      const contentType = resp.headers.get('content-type') || '';
      const rawBody = await resp.text();
      if (!resp.ok) throw new Error(`Webhook error ${resp.status}: ${rawBody}`);

      let replyText = '';
      if (contentType.includes('application/json')) {
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

  window.addEventListener('load', () => {
    try {
      sessionId = newSessionId();
      startNewChat();
      initializeGSI();
      gate();
    } catch (e) {
      console.error('[load init] failed:', e);
      try { startNewChat(); } catch {}
    }
  });
})();
