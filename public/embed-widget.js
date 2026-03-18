(function () {
  const LIBPHONE_URL = 'https://unpkg.com/libphonenumber-js@1.11.18/bundle/libphonenumber-js.min.js';
  const STRIPE_JS_URL = 'https://js.stripe.com/v3/';
  const currentScript = document.currentScript;
  const defaultBaseUrl = currentScript ? new URL(currentScript.src, window.location.href).origin : window.location.origin;
  let libPhonePromise = null;
  let stripeJsPromise = null;

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      if (value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Ignore storage failures and fall back to in-memory token handling.
    }
  }

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

  function loadStripeJs() {
    if (window.Stripe) {
      return Promise.resolve(window.Stripe);
    }
    if (stripeJsPromise) {
      return stripeJsPromise;
    }

    stripeJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = STRIPE_JS_URL;
      script.async = true;
      script.onload = () => resolve(window.Stripe);
      script.onerror = () => reject(new Error('Failed to load Stripe.js'));
      document.head.appendChild(script);
    });

    return stripeJsPromise;
  }

  function createWidgetStyles() {
    return `
      .lsw-root {
        display: block;
        color: #142033;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        background: inherit;
        --lsw-frame-background: inherit;
        --lsw-card-background: #fff;
      }
      .lsw-root * {
        box-sizing: border-box;
      }
      .lsw-root .frame {
        background: var(--lsw-frame-background);
        border: 1px solid #d8e2f4;
        border-radius: 18px;
        box-shadow: 0 16px 50px rgba(20, 32, 51, 0.1);
        overflow: hidden;
      }
      .lsw-root .topbar {
        padding: 1rem 1.25rem;
        background: linear-gradient(135deg, #0d2345 0%, #1d4d8f 100%);
        color: #fff;
      }
      .lsw-root .eyebrow {
        margin: 0 0 0.3rem;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.75;
      }
      .lsw-root .title {
        margin: 0;
        font-size: 1.4rem;
      }
      .lsw-root .body {
        padding: 1.25rem;
      }
      .lsw-root .offer {
        margin: 0 0 1rem;
        color: #38506f;
      }
      .lsw-root .card {
        border: 1px solid #d8e2f4;
        border-radius: 14px;
        padding: 1rem;
        background: var(--lsw-card-background);
      }
      .lsw-root .hidden {
        display: none !important;
      }
      .lsw-root label {
        display: block;
        margin-bottom: 0.4rem;
        font-size: 0.9rem;
        color: #38506f;
      }
      .lsw-root input {
        width: 100%;
        padding: 0.8rem 0.9rem;
        border-radius: 12px;
        border: 1px solid #cad8ee;
        font-size: 1rem;
        margin-bottom: 0.75rem;
      }
      .lsw-root .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
      }
      .lsw-root .section-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .lsw-root .section-head .viewer-meta {
        margin-bottom: 0;
      }
      .lsw-root button,
      .lsw-root a.button {
        appearance: none;
        border: 0;
        border-radius: 12px;
        padding: 0.85rem 1.1rem;
        font-size: 0.95rem;
        cursor: pointer;
        text-decoration: none;
      }
      .lsw-root .primary {
        background: #1765ff;
        color: #fff;
      }
      .lsw-root .primary:hover {
        background: #0f4fd1;
      }
      .lsw-root .secondary {
        background: #eef4ff;
        color: #15396b;
      }
      .lsw-root .ghost {
        background: #edf1f7;
        color: #142033;
      }
      .lsw-root button:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .lsw-root .status {
        min-height: 1.4rem;
        margin: 0.9rem 0 0;
        color: #38506f;
      }
      .lsw-root .viewer-meta {
        margin: 0 0 0.9rem;
        color: #38506f;
      }
      .lsw-root .payment-shell {
        padding: 0.9rem;
        border: 1px solid rgba(216, 226, 244, 0.32);
        border-radius: 14px;
        backdrop-filter: blur(10px);
      }
      .lsw-root .payment-note {
        margin: 0 0 0.7rem;
        color: #506681;
        font-size: 0.9rem;
      }
      .lsw-root .amount-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        align-items: center;
        margin: 0.9rem 0 0.85rem;
      }
      .lsw-root .amount-chip {
        padding: 0.7rem 0.95rem;
        border-radius: 999px;
        border: 1px solid #cad8ee;
        background: #fff;
        color: #15396b;
      }
      .lsw-root .amount-chip.is-active {
        background: #1765ff;
        border-color: #1765ff;
        color: #fff;
      }
      .lsw-root .custom-wrap {
        display: flex;
        gap: 0.65rem;
        align-items: center;
        flex-wrap: nowrap;
        margin: 0;
      }
      .lsw-root .custom-field {
        flex: 0 1 140px;
      }
      .lsw-root .custom-field label {
        margin-bottom: 0.25rem;
        font-size: 0.8rem;
      }
      .lsw-root .custom-field input {
        margin-bottom: 0;
      }
      @media (max-width: 760px) {
        .lsw-root .custom-wrap {
          flex-wrap: wrap;
        }
        .lsw-root .custom-field {
          flex-basis: 100%;
        }
      }
      .lsw-root .payment-element {
        min-height: 46px;
      }
      .lsw-root .video {
        position: relative;
        width: 100%;
        padding-top: 56.25%;
        background: #000;
        border-radius: 14px;
        overflow: hidden;
      }
      .lsw-root .video iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
      }
      .lsw-root .video-toolbar {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: center;
        flex-wrap: wrap;
        margin: 0 0 0.9rem;
      }
      @media (max-width: 640px) {
        .lsw-root .topbar {
          padding: 0.95rem 1rem;
        }
        .lsw-root .body {
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
      this.storageKey = `lion-and-sun-auth-token:${this.apiBase}`;
      this.authToken = readStorage(this.storageKey);
      this.root = rootEl;
      this.state = {
        config: null,
        auth: { authenticated: false, hasAccess: false },
        selectedAmountCents: null,
        paymentOverlayOpen: false,
      };
      this.renderShell();
    }

    async mount() {
      await Promise.all([loadLibPhone(), loadStripeJs()]);
      this.bindElements();
      await this.loadInitialState();
      this.attachEvents();
      if (this.state.paymentOverlayOpen) {
        try {
          await this.ensurePaymentElement();
        } catch (error) {
          this.setStatus(error.message);
        }
      }
    }

    renderShell() {
      const title = this.options.title || 'Private Livestream';
      this.root.innerHTML = `
        <style>${createWidgetStyles()}</style>
        <div class="lsw-root">
        <div class="frame">
          <div class="topbar">
            <p class="eyebrow">Lion and Sun</p>
            <h2 class="title">${title}</h2>
          </div>
          <div class="body">
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
              <div class="section-head">
                <p class="viewer-meta" data-pay-meta></p>
                <button class="ghost" type="button" data-close-payment>Close</button>
              </div>
              <div class="amount-grid" data-amount-grid></div>
              <div class="payment-shell" data-payment-shell>
                <p class="payment-note">Card details stay inside this page.</p>
                <div class="payment-element" data-payment-element></div>
              </div>
              <div class="actions">
                <button class="primary" type="button" data-pay>Pay With Card</button>
              </div>
            </section>
            <section class="card hidden" data-video-card>
              <div class="video-toolbar">
                <p class="viewer-meta" data-viewer-meta></p>
                <div class="actions">
                  <button class="secondary hidden" type="button" data-donate-more>Donate More</button>
                  <button class="ghost" type="button" data-logout>Log Out</button>
                </div>
              </div>
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
        </div>
      `;
    }

    bindElements() {
      const $ = (selector) => this.root.querySelector(selector);
      this.loginCardEl = $('[data-login-card]');
      this.codeBlockEl = $('[data-code-block]');
      this.payCardEl = $('[data-pay-card]');
      this.videoCardEl = $('[data-video-card]');
      this.viewerMetaEl = $('[data-viewer-meta]');
      this.payMetaEl = $('[data-pay-meta]');
      this.closePaymentEl = $('[data-close-payment]');
      this.amountGridEl = $('[data-amount-grid]');
      this.paymentShellEl = $('[data-payment-shell]');
      this.paymentElementEl = $('[data-payment-element]');
      this.videoMetaEl = $('[data-video-meta]');
      this.statusEl = $('[data-status]');
      this.phoneEl = $('#phone');
      this.codeEl = $('#code');
      this.requestCodeEl = $('[data-request-code]');
      this.verifyCodeEl = $('[data-verify-code]');
      this.payEl = $('[data-pay]');
      this.donateMoreEl = $('[data-donate-more]');
      this.logoutEl = $('[data-logout]');
      this.videoFrameEl = $('[data-video-frame]');
      this.customAmountEl = document.createElement('input');
      this.customAmountEl.id = 'custom-amount';
      this.customAmountEl.type = 'number';
      this.customAmountEl.min = '10';
      this.customAmountEl.step = '1';
      this.customAmountEl.inputMode = 'decimal';
      this.customAmountEl.placeholder = '10';
      this.applyCustomEl = document.createElement('button');
      this.applyCustomEl.type = 'button';
      this.applyCustomEl.className = 'secondary';
      this.applyCustomEl.textContent = 'Use Custom Amount';
    }

    attachEvents() {
      this.phoneEl.dataset.digits = '';
      this.phoneEl.addEventListener('keydown', (event) => this.onPhoneKeyDown(event));
      this.phoneEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.requestCode();
        }
      });
      this.phoneEl.addEventListener('input', () => this.onPhoneInput());
      this.codeEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.verifyCode();
        }
      });
      this.requestCodeEl.addEventListener('click', () => this.requestCode());
      this.verifyCodeEl.addEventListener('click', () => this.verifyCode());
      this.applyCustomEl.addEventListener('click', () => this.applyCustomAmount());
      this.payEl.addEventListener('click', () => this.startCheckout());
      this.closePaymentEl.addEventListener('click', () => this.handlePaymentSecondaryAction());
      this.donateMoreEl.addEventListener('click', () => this.openPaymentOverlay());
      this.logoutEl.addEventListener('click', () => this.logout());
    }

    async loadInitialState() {
      const [config, auth] = await Promise.all([this.fetchJson('/api/config'), this.fetchJson('/auth/me')]);
      this.state.config = config;
      this.state.auth = auth;
      this.state.selectedAmountCents = config.minPaymentAmountCents;
      this.state.paymentOverlayOpen = !auth.hasAccess;
      this.stripe = window.Stripe(config.stripePublishableKey);
      this.render();
    }

    async fetchJson(path, options) {
      const headers = { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) };
      if (this.authToken) {
        headers.Authorization = `Bearer ${this.authToken}`;
      }

      const response = await fetch(`${this.apiBase}${path}`, {
        credentials: 'include',
        headers,
        ...options,
      });

      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.clearAuthToken();
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
      }
      return payload;
    }

    setAuthToken(token) {
      this.authToken = token || null;
      writeStorage(this.storageKey, this.authToken);
    }

    clearAuthToken() {
      this.setAuthToken(null);
    }

    setBusy(isBusy) {
      this.requestCodeEl.disabled = isBusy;
      this.verifyCodeEl.disabled = isBusy;
      this.payEl.disabled = isBusy || !this.paymentElementReady;
      this.logoutEl.disabled = isBusy;
      this.donateMoreEl.disabled = isBusy;
      this.closePaymentEl.disabled = isBusy;
      this.applyCustomEl.disabled = isBusy;
      this.amountGridEl.querySelectorAll('button').forEach((button) => {
        button.disabled = isBusy;
      });
    }

    setStatus(message) {
      this.statusEl.textContent = message || '';
    }

    formatCurrency(amountCents) {
      const config = this.state.config;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (config && config.currency ? config.currency : 'usd').toUpperCase(),
      }).format(amountCents / 100);
    }

    renderAmountOptions() {
      const config = this.state.config;
      const selected = this.state.selectedAmountCents;
      this.amountGridEl.innerHTML = '';

      config.suggestedAmountsCents.forEach((amountCents) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `amount-chip${selected === amountCents ? ' is-active' : ''}`;
        button.textContent = this.formatCurrency(amountCents);
        button.addEventListener('click', () => {
          this.customAmountEl.value = String(amountCents / 100);
          this.setSelectedAmount(amountCents);
        });
        this.amountGridEl.appendChild(button);
      });

      const customWrap = document.createElement('div');
      customWrap.className = 'custom-wrap';

      const customField = document.createElement('div');
      customField.className = 'custom-field';

      const customLabel = document.createElement('label');
      customLabel.htmlFor = 'custom-amount';
      customLabel.textContent = 'Custom amount';

      // customField.appendChild(customLabel);
      customField.appendChild(this.customAmountEl);
      customWrap.appendChild(customField);
      customWrap.appendChild(this.applyCustomEl);
      this.amountGridEl.appendChild(customWrap);

      this.customAmountEl.min = String(config.minPaymentAmountCents / 100);
      if (!this.customAmountEl.value) {
        this.customAmountEl.value = String(selected / 100);
      }
    }

    async setSelectedAmount(amountCents) {
      if (this.state.selectedAmountCents === amountCents) {
        this.render();
        return;
      }

      this.state.selectedAmountCents = amountCents;
      this.render();
      if (this.state.auth.authenticated && this.state.paymentOverlayOpen) {
        this.setStatus(`Preparing payment form for ${this.formatCurrency(amountCents)}...`);
        try {
          await this.ensurePaymentElement(true);
          this.setStatus('');
        } catch (error) {
          this.setStatus(error.message);
        }
      }
    }

    async openPaymentOverlay() {
      this.state.paymentOverlayOpen = true;
      this.render();
      try {
        await this.ensurePaymentElement();
      } catch (error) {
        this.setStatus(error.message);
      }
    }

    closePaymentOverlay() {
      this.state.paymentOverlayOpen = false;
      this.resetPaymentElement();
      this.render();
    }

    async closePaymentSection() {
      this.setBusy(true);
      try {
        if (this.paymentIntentId) {
          await this.fetchJson('/payments/cancel', {
            method: 'POST',
            body: JSON.stringify({ paymentIntentId: this.paymentIntentId }),
          });
        }
        this.closePaymentOverlay();
        this.setStatus('Payment form closed.');
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        this.setBusy(false);
      }
    }

    async handlePaymentSecondaryAction() {
      if (this.state.auth.hasAccess) {
        await this.closePaymentSection();
        return;
      }

      await this.logout();
    }

    async applyCustomAmount() {
      const config = this.state.config;
      const amountDollars = Number(this.customAmountEl.value);
      const amountCents = Math.round(amountDollars * 100);

      if (!Number.isFinite(amountDollars) || amountCents < config.minPaymentAmountCents) {
        this.setStatus(`Custom amount must be at least ${this.formatCurrency(config.minPaymentAmountCents)}.`);
        return;
      }

      await this.setSelectedAmount(amountCents);
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
      this.codeEl.maxLength = config.loginCodeLength;
      this.renderAmountOptions();
      this.loginCardEl.classList.toggle('hidden', auth.authenticated);
      this.payCardEl.classList.toggle('hidden', !auth.authenticated || (auth.hasAccess && !this.state.paymentOverlayOpen));
      this.videoCardEl.classList.toggle('hidden', !auth.hasAccess);
      this.payMetaEl.textContent = '';
      this.videoMetaEl.textContent = '';
      this.paymentShellEl.classList.toggle('hidden', !auth.authenticated);
      this.donateMoreEl.classList.toggle('hidden', !auth.hasAccess);
      this.closePaymentEl.textContent = auth.hasAccess ? 'Close' : 'Log Out';

      if (auth.authenticated) {
        this.viewerMetaEl.textContent = `Logged in as ${auth.phone || 'phone user'}`;
        if (auth.hasAccess) {
          this.payMetaEl.textContent = `You already have access. You can contribute ${this.formatCurrency(this.state.selectedAmountCents)} or choose another amount.`;
          this.payEl.textContent = 'Pay More With Card';
          this.videoMetaEl.textContent = `${auth.phone || 'Viewer'} has active access.`;
        } else {
          this.payMetaEl.textContent = `Complete payment of ${this.formatCurrency(this.state.selectedAmountCents)} or more to unlock the livestream.`;
          this.payEl.textContent = `Pay ${this.formatCurrency(this.state.selectedAmountCents)}`;
        }
      } else {
        this.viewerMetaEl.textContent = '';
        this.payEl.textContent = `Pay ${this.formatCurrency(this.state.selectedAmountCents)}`;
      }

      if (auth.hasAccess) {
        this.videoFrameEl.src = `https://www.youtube.com/embed/${config.youtubeLivestreamId}`;
      } else {
        this.videoFrameEl.removeAttribute('src');
      }

      this.setBusy(false);
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
        this.codeEl.focus();
        this.codeEl.select();
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
        const verifyResult = await this.fetchJson('/auth/verify-code', {
          method: 'POST',
          body: JSON.stringify({ phone, code }),
        });
        if (verifyResult.authToken) {
          this.setAuthToken(verifyResult.authToken);
        }
        this.state.auth = await this.fetchJson('/auth/me');
        this.state.paymentOverlayOpen = !this.state.auth.hasAccess;
        this.render();
        await this.ensurePaymentElement(true);
        this.setStatus('Logged in.');
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        this.setBusy(false);
      }
    }

    async startCheckout() {
      if (!this.state.auth.authenticated) {
        this.setStatus('Log in first.');
        return;
      }

      this.setBusy(true);
      this.setStatus('Preparing payment...');
      try {
        if (!this.elements) {
          await this.ensurePaymentElement(true);
        }
        if (!this.elements || !this.paymentElementReadyPromise) {
          throw new Error('Payment form is not ready.');
        }
        await this.paymentElementReadyPromise;
        if (!this.paymentElementReady) {
          throw new Error('Payment form is not ready.');
        }

        this.setStatus('Processing payment...');
        const result = await this.stripe.confirmPayment({
          elements: this.elements,
          redirect: 'if_required',
        });

        if (result.error) {
          throw new Error(result.error.message || 'Payment failed');
        }
        if (!result.paymentIntent || result.paymentIntent.status !== 'succeeded') {
          throw new Error('Payment was not completed');
        }

        await this.fetchJson('/payments/finalize', {
          method: 'POST',
          body: JSON.stringify({ paymentIntentId: result.paymentIntent.id }),
        });
        this.state.auth = await this.fetchJson('/auth/me');
        this.state.paymentOverlayOpen = false;
        this.resetPaymentElement();
        this.render();
        this.setStatus('Payment successful. Livestream access is active.');
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        this.setBusy(false);
      }
    }

    async logout() {
      this.setBusy(true);
      try {
        await this.fetchJson('/auth/logout', { method: 'POST' });
        this.clearAuthToken();
        this.state.auth = { authenticated: false, hasAccess: false };
        this.state.paymentOverlayOpen = false;
        this.codeEl.value = '';
        this.codeBlockEl.classList.add('hidden');
        this.resetPaymentElement();
        this.setStatus('Logged out.');
        this.render();
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        this.setBusy(false);
      }
    }

    resetPaymentElement() {
      if (this.paymentElement) {
        this.paymentElement.destroy();
        this.paymentElement = null;
      }
      this.elements = null;
      this.clientSecret = null;
      this.paymentIntentId = null;
      this.paymentElementReady = false;
      this.paymentElementReadyPromise = null;
      if (this.paymentElementEl) {
        this.paymentElementEl.innerHTML = '';
      }
    }

    async ensurePaymentElement(forceRefresh) {
      if (!this.state.auth.authenticated) {
        this.resetPaymentElement();
        return;
      }

      if (forceRefresh && !this.paymentElement) {
        this.resetPaymentElement();
      }

      if (this.paymentElement && !forceRefresh) {
        return;
      }

      const paymentIntent = await this.fetchJson('/create-payment-intent', {
        method: 'POST',
        body: JSON.stringify({
          amountCents: this.state.selectedAmountCents,
          paymentIntentId: this.paymentIntentId,
        }),
      });

      this.paymentIntentId = paymentIntent.paymentIntentId;
      this.clientSecret = paymentIntent.clientSecret;

      if (this.paymentElement && paymentIntent.reusedExisting) {
        this.paymentElementReady = true;
        this.paymentElementReadyPromise = Promise.resolve();
        this.setBusy(false);
        return;
      }

      if (this.paymentElement) {
        this.resetPaymentElement();
        this.paymentIntentId = paymentIntent.paymentIntentId;
        this.clientSecret = paymentIntent.clientSecret;
      }

      this.elements = this.stripe.elements({
        clientSecret: this.clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorBackground: '#1b2d32',
            borderRadius: '12px',
          },
        },
      });
      this.paymentElement = this.elements.create('payment');
      this.paymentElementReady = false;
      this.paymentElementReadyPromise = new Promise((resolve) => {
        this.paymentElement.on('ready', () => {
          this.paymentElementReady = true;
          this.setBusy(false);
          resolve();
        });
      });
      this.paymentElement.mount(this.paymentElementEl);
      this.setBusy(true);
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
