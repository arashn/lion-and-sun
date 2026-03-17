(function () {
  const LIBPHONE_URL = 'https://unpkg.com/libphonenumber-js@1.11.18/bundle/libphonenumber-js.min.js';
  const currentScript = document.currentScript;
  const defaultBaseUrl = currentScript ? new URL(currentScript.src, window.location.href).origin : window.location.origin;
  let libPhonePromise = null;

  function loadLibPhone() {
    if (window.libphonenumber) {
      return Promise.resolve(window.libphonenumber);
    }
    if (libPhonePromise) {
      return libPhonePromise;
    }

    libPhonePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LIBPHONE_URL;
      script.async = true;
      script.onload = () => resolve(window.libphonenumber);
      script.onerror = () => reject(new Error('Failed to load phone formatter'));
      document.head.appendChild(script);
    });

    return libPhonePromise;
  }

  function createWidgetStyles() {
    return `
      :host {
        display: block;
        color: #142033;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      .frame {
        background: linear-gradient(180deg, #fcfdff 0%, #f2f6fd 100%);
        border: 1px solid #d8e2f4;
        border-radius: 18px;
        box-shadow: 0 16px 50px rgba(20, 32, 51, 0.1);
        overflow: hidden;
      }
      .topbar {
        padding: 1rem 1.25rem;
        background: linear-gradient(135deg, #0d2345 0%, #1d4d8f 100%);
        color: #fff;
      }
      .eyebrow {
        margin: 0 0 0.3rem;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.75;
      }
      .title {
        margin: 0;
        font-size: 1.4rem;
      }
      .body {
        padding: 1.25rem;
      }
      .offer {
        margin: 0 0 1rem;
        color: #38506f;
      }
      .card {
        border: 1px solid #d8e2f4;
        border-radius: 14px;
        padding: 1rem;
        background: #fff;
      }
      .hidden {
        display: none !important;
      }
      label {
        display: block;
        margin-bottom: 0.4rem;
        font-size: 0.9rem;
        color: #38506f;
      }
      input {
        width: 100%;
        padding: 0.8rem 0.9rem;
        border-radius: 12px;
        border: 1px solid #cad8ee;
        font-size: 1rem;
        margin-bottom: 0.75rem;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
      }
      button,
      a.button {
        appearance: none;
        border: 0;
        border-radius: 12px;
        padding: 0.85rem 1.1rem;
        font-size: 0.95rem;
        cursor: pointer;
        text-decoration: none;
      }
      .primary {
        background: #1765ff;
        color: #fff;
      }
      .primary:hover {
        background: #0f4fd1;
      }
      .secondary {
        background: #eef4ff;
        color: #15396b;
      }
      .ghost {
        background: #edf1f7;
        color: #142033;
      }
      button:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .status {
        min-height: 1.4rem;
        margin: 0.9rem 0 0;
        color: #38506f;
      }
      .viewer-meta {
        margin: 0 0 0.9rem;
        color: #38506f;
      }
      .video {
        position: relative;
        width: 100%;
        padding-top: 56.25%;
        background: #000;
        border-radius: 14px;
        overflow: hidden;
      }
      .video iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
      }
      @media (max-width: 640px) {
        .topbar {
          padding: 0.95rem 1rem;
        }
        .body {
          padding: 1rem;
        }
      }
    `;
  }

  class LionAndSunWidget {
    constructor(rootEl, options) {
      this.rootEl = rootEl;
      this.options = options || {};
      this.apiBase = (this.options.apiBase || defaultBaseUrl).replace(/\/$/, '');
      this.returnUrl = this.options.returnUrl || window.location.href;
      this.shadow = rootEl.attachShadow({ mode: 'open' });
      this.state = {
        config: null,
        auth: { authenticated: false, hasAccess: false },
      };
      this.renderShell();
    }

    async mount() {
      await loadLibPhone();
      this.bindElements();
      await this.loadInitialState();
      this.attachEvents();
    }

    renderShell() {
      const title = this.options.title || 'Private Livestream';
      this.shadow.innerHTML = `
        <style>${createWidgetStyles()}</style>
        <div class="frame">
          <div class="topbar">
            <p class="eyebrow">Lion and Sun</p>
            <h2 class="title">${title}</h2>
          </div>
          <div class="body">
            <p class="offer" data-offer></p>
            <section class="card" data-login-card>
              <label for="phone">Phone (US)</label>
              <input id="phone" type="tel" placeholder="(415) 555-0123" autocomplete="tel-national" />
              <button class="primary" type="button" data-request-code>Send Login Code</button>
              <div class="hidden" data-code-block>
                <label for="code">Login Code</label>
                <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter code" />
                <button class="secondary" type="button" data-verify-code>Verify Code</button>
              </div>
            </section>
            <section class="card hidden" data-pay-card>
              <p class="viewer-meta" data-viewer-meta></p>
              <div class="actions">
                <button class="primary" type="button" data-pay>Pay With Stripe Checkout</button>
                <button class="ghost" type="button" data-logout>Log Out</button>
              </div>
            </section>
            <section class="card hidden" data-video-card>
              <p class="viewer-meta" data-video-meta></p>
              <div class="video">
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                  referrerpolicy="strict-origin-when-cross-origin"
                  title="YouTube livestream"
                  data-video-frame
                ></iframe>
              </div>
            </section>
            <p class="status" data-status></p>
          </div>
        </div>
      `;
    }

    bindElements() {
      const $ = (selector) => this.shadow.querySelector(selector);
      this.offerEl = $('[data-offer]');
      this.loginCardEl = $('[data-login-card]');
      this.codeBlockEl = $('[data-code-block]');
      this.payCardEl = $('[data-pay-card]');
      this.videoCardEl = $('[data-video-card]');
      this.viewerMetaEl = $('[data-viewer-meta]');
      this.videoMetaEl = $('[data-video-meta]');
      this.statusEl = $('[data-status]');
      this.phoneEl = $('#phone');
      this.codeEl = $('#code');
      this.requestCodeEl = $('[data-request-code]');
      this.verifyCodeEl = $('[data-verify-code]');
      this.payEl = $('[data-pay]');
      this.logoutEl = $('[data-logout]');
      this.videoFrameEl = $('[data-video-frame]');
    }

    attachEvents() {
      this.phoneEl.dataset.digits = '';
      this.phoneEl.addEventListener('keydown', (event) => this.onPhoneKeyDown(event));
      this.phoneEl.addEventListener('input', () => this.onPhoneInput());
      this.requestCodeEl.addEventListener('click', () => this.requestCode());
      this.verifyCodeEl.addEventListener('click', () => this.verifyCode());
      this.payEl.addEventListener('click', () => this.startCheckout());
      this.logoutEl.addEventListener('click', () => this.logout());
    }

    async loadInitialState() {
      const [config, auth] = await Promise.all([this.fetchJson('/api/config'), this.fetchJson('/auth/me')]);
      this.state.config = config;
      this.state.auth = auth;
      this.render();
    }

    async fetchJson(path, options) {
      const response = await fetch(`${this.apiBase}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
      }
      return payload;
    }

    setBusy(isBusy) {
      this.requestCodeEl.disabled = isBusy;
      this.verifyCodeEl.disabled = isBusy;
      this.payEl.disabled = isBusy;
      this.logoutEl.disabled = isBusy;
    }

    setStatus(message) {
      this.statusEl.textContent = message || '';
    }

    digitsBeforeCaret(value, caret) {
      return (value.slice(0, caret).match(/\d/g) || []).length;
    }

    caretFromDigitIndex(formatted, digitIndex) {
      if (digitIndex <= 0) {
        return 0;
      }
      let count = 0;
      for (let i = 0; i < formatted.length; i += 1) {
        if (/\d/.test(formatted[i])) {
          count += 1;
          if (count === digitIndex) {
            return i + 1;
          }
        }
      }
      return formatted.length;
    }

    applyPhoneDigits(nextDigits, caretDigitIndex) {
      const limitedDigits = nextDigits.slice(0, 10);
      const formatter = new window.libphonenumber.AsYouType('US');
      const formatted = formatter.input(limitedDigits);
      this.phoneEl.value = formatted;
      this.phoneEl.dataset.digits = limitedDigits;
      const caret = this.caretFromDigitIndex(formatted, Math.min(caretDigitIndex, limitedDigits.length));
      this.phoneEl.setSelectionRange(caret, caret);
    }

    onPhoneKeyDown(event) {
      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return;
      }

      const digits = this.phoneEl.dataset.digits || '';
      const start = this.phoneEl.selectionStart || 0;
      const end = this.phoneEl.selectionEnd || 0;
      const startDigit = this.digitsBeforeCaret(this.phoneEl.value, start);
      const endDigit = this.digitsBeforeCaret(this.phoneEl.value, end);
      let nextDigits = digits;
      let nextCaretDigit = startDigit;

      if (startDigit !== endDigit) {
        nextDigits = digits.slice(0, startDigit) + digits.slice(endDigit);
      } else if (event.key === 'Backspace') {
        if ((event.ctrlKey || event.metaKey) && startDigit > 0) {
          nextDigits = digits.slice(startDigit);
          nextCaretDigit = 0;
        } else if (startDigit > 0) {
          nextDigits = digits.slice(0, startDigit - 1) + digits.slice(startDigit);
          nextCaretDigit = startDigit - 1;
        }
      } else if (event.key === 'Delete') {
        if (event.ctrlKey || event.metaKey) {
          nextDigits = digits.slice(0, startDigit);
        } else if (startDigit < digits.length) {
          nextDigits = digits.slice(0, startDigit) + digits.slice(startDigit + 1);
        }
      }

      event.preventDefault();
      this.applyPhoneDigits(nextDigits, nextCaretDigit);
    }

    onPhoneInput() {
      const rawValue = this.phoneEl.value;
      const rawCaret = this.phoneEl.selectionStart || rawValue.length;
      const nextDigits = rawValue.replace(/\D/g, '').slice(0, 10);
      const caretDigitIndex = this.digitsBeforeCaret(rawValue, rawCaret);
      this.applyPhoneDigits(nextDigits, caretDigitIndex);
    }

    getPhoneE164OrNull() {
      const parsed = window.libphonenumber.parsePhoneNumberFromString(this.phoneEl.value, 'US');
      if (!parsed || !parsed.isValid() || parsed.country !== 'US') {
        return null;
      }
      return parsed.number;
    }

    render() {
      const config = this.state.config;
      const auth = this.state.auth;
      this.offerEl.textContent = `${config.offerText}. Access duration: ${config.streamAccessHours} hours.`;
      this.codeEl.maxLength = config.loginCodeLength;
      this.loginCardEl.classList.toggle('hidden', auth.authenticated);
      this.payCardEl.classList.toggle('hidden', !auth.authenticated || auth.hasAccess);
      this.videoCardEl.classList.toggle('hidden', !auth.hasAccess);

      if (auth.authenticated) {
        this.viewerMetaEl.textContent = `Logged in as ${auth.phone || 'phone user'}`;
        this.videoMetaEl.textContent = `${auth.phone || 'Viewer'} has active access.`;
      }

      if (auth.hasAccess) {
        this.videoFrameEl.src = `https://www.youtube.com/embed/${config.youtubeLivestreamId}`;
      } else {
        this.videoFrameEl.removeAttribute('src');
      }
    }

    async requestCode() {
      const phone = this.getPhoneE164OrNull();
      if (!phone) {
        this.setStatus('Enter a valid US phone number.');
        return;
      }

      this.setBusy(true);
      this.setStatus('Sending code...');
      try {
        await this.fetchJson('/auth/request-code', {
          method: 'POST',
          body: JSON.stringify({ phone }),
        });
        this.codeBlockEl.classList.remove('hidden');
        this.setStatus('Code sent by SMS.');
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        this.setBusy(false);
      }
    }

    async verifyCode() {
      const phone = this.getPhoneE164OrNull();
      const code = this.codeEl.value.trim();
      if (!phone || !code) {
        this.setStatus('Enter both phone and code.');
        return;
      }

      this.setBusy(true);
      this.setStatus('Verifying code...');
      try {
        await this.fetchJson('/auth/verify-code', {
          method: 'POST',
          body: JSON.stringify({ phone, code }),
        });
        this.state.auth = await this.fetchJson('/auth/me');
        this.setStatus('Logged in.');
        this.render();
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        this.setBusy(false);
      }
    }

    async startCheckout() {
      this.setBusy(true);
      this.setStatus('Starting checkout...');
      try {
        const session = await this.fetchJson('/create-checkout-session', {
          method: 'POST',
          body: JSON.stringify({ returnUrl: this.returnUrl }),
        });
        window.location.href = session.url;
      } catch (error) {
        this.setStatus(error.message);
        this.setBusy(false);
      }
    }

    async logout() {
      this.setBusy(true);
      try {
        await this.fetchJson('/auth/logout', { method: 'POST' });
        this.state.auth = { authenticated: false, hasAccess: false };
        this.codeEl.value = '';
        this.codeBlockEl.classList.add('hidden');
        this.setStatus('Logged out.');
        this.render();
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        this.setBusy(false);
      }
    }
  }

  function resolveMountNode(target) {
    if (!target) {
      return null;
    }
    if (typeof target === 'string') {
      return document.querySelector(target);
    }
    return target;
  }

  async function mount(target, options) {
    const node = resolveMountNode(target);
    if (!node) {
      throw new Error('Widget mount target not found');
    }
    const widget = new LionAndSunWidget(node, options);
    await widget.mount();
    return widget;
  }

  window.LionAndSunWidget = { mount };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-lion-sun-widget]').forEach((node) => {
      if (!node.dataset.widgetMounted) {
        node.dataset.widgetMounted = 'true';
        mount(node, {
          title: node.dataset.title,
          apiBase: node.dataset.apiBase,
          returnUrl: node.dataset.returnUrl,
        }).catch((error) => {
          node.textContent = error.message;
        });
      }
    });
  });
})();
