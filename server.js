const crypto = require('crypto');
const path = require('path');

const dotenv = require('dotenv');
const express = require('express');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { Pool } = require('pg');
const Stripe = require('stripe');
const twilio = require('twilio');

dotenv.config();

const app = express();

const {
  PORT = 3000,
  BASE_URL = 'http://localhost:3000',
  DATABASE_URL,
  DATABASE_SSL = 'false',
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_PRICE_ID,
  STREAM_ACCESS_HOURS = '24',
  MIN_PAYMENT_AMOUNT_USD_CENTS = '1000',
  SUGGESTED_AMOUNTS_USD_CENTS = '1000,2000,5000',
  EVENT_START_TIME,
  LOGIN_CODE_LENGTH = '6',
  AUTH_SESSION_DAYS = '30',
  ACCESS_TOKEN_SECRET,
  YOUTUBE_LIVESTREAM_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID,
  EMBED_ALLOWED_ORIGINS = '',
  AUTH_COOKIE_SAME_SITE = 'Lax',
} = process.env;

if (!DATABASE_URL) {
  throw new Error('Missing DATABASE_URL');
}
if (!STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}
if (!STRIPE_PUBLISHABLE_KEY) {
  throw new Error('Missing STRIPE_PUBLISHABLE_KEY');
}
if (!STRIPE_PRICE_ID) {
  throw new Error('Missing STRIPE_PRICE_ID');
}
if (!EVENT_START_TIME || Number.isNaN(Date.parse(EVENT_START_TIME))) {
  throw new Error('Missing or invalid EVENT_START_TIME');
}
if (!YOUTUBE_LIVESTREAM_ID) {
  throw new Error('Missing YOUTUBE_LIVESTREAM_ID');
}
if (!ACCESS_TOKEN_SECRET) {
  throw new Error('Missing ACCESS_TOKEN_SECRET');
}
if (!TWILIO_ACCOUNT_SID) {
  throw new Error('Missing TWILIO_ACCOUNT_SID');
}
if (!TWILIO_AUTH_TOKEN) {
  throw new Error('Missing TWILIO_AUTH_TOKEN');
}
if (!TWILIO_VERIFY_SERVICE_SID) {
  throw new Error('Missing TWILIO_VERIFY_SERVICE_SID');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    DATABASE_SSL === 'true'
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
});

const stripe = new Stripe(STRIPE_SECRET_KEY);
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
let stripeOfferText = 'Livestream access';
let stripePriceCurrency = 'usd';
const minPaymentAmountCents = Number(MIN_PAYMENT_AMOUNT_USD_CENTS);
const suggestedAmountsCents = SUGGESTED_AMOUNTS_USD_CENTS.split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= minPaymentAmountCents);
const embedAllowedOrigins = EMBED_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && embedAllowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

function normalizePhone(rawPhone) {
  const phone = String(rawPhone || '').trim();
  const parsed = parsePhoneNumberFromString(phone, 'US');
  if (!parsed || !parsed.isValid() || parsed.country !== 'US') {
    return null;
  }
  return parsed.number;
}

function createSignedToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', ACCESS_TOKEN_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

function verifySignedToken(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', ACCESS_TOKEN_SECRET)
    .update(body)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) {
    return cookies;
  }

  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim() || null;
}

function setCookie(res, key, value, maxAgeSeconds) {
  const secure = BASE_URL.startsWith('https://');
  const sameSite = AUTH_COOKIE_SAME_SITE;
  const secureAttr = secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${key}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secureAttr}`
  );
}

function clearCookie(res, key) {
  const secure = BASE_URL.startsWith('https://');
  const sameSite = AUTH_COOKIE_SAME_SITE;
  const secureAttr = secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${key}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secureAttr}`
  );
}

function getClientConfig() {
  return {
    offerText: stripeOfferText,
    eventStartTime: EVENT_START_TIME,
    streamAccessHours: Number(STREAM_ACCESS_HOURS),
    youtubeLivestreamId: YOUTUBE_LIVESTREAM_ID,
    loginCodeLength: Number(LOGIN_CODE_LENGTH),
    baseUrl: BASE_URL,
    stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
    minPaymentAmountCents,
    suggestedAmountsCents: suggestedAmountsCents.length
      ? suggestedAmountsCents
      : [minPaymentAmountCents, minPaymentAmountCents * 2, minPaymentAmountCents * 5],
    currency: stripePriceCurrency,
  };
}

function isAllowedReturnUrl(returnUrl) {
  if (!returnUrl) {
    return false;
  }

  try {
    const parsed = new URL(returnUrl);
    const baseOrigin = new URL(BASE_URL).origin;
    return parsed.origin === baseOrigin || embedAllowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
}

function getAuthUserFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const authToken = getBearerToken(req) || cookies.auth_token;
  const payload = verifySignedToken(authToken);
  if (!payload || !payload.sub || !payload.phone) {
    return null;
  }

  return {
    id: Number(payload.sub),
    phone: payload.phone,
  };
}

function requireAuth(req, res, next) {
  const user = getAuthUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.user = user;
  return next();
}

function requireAuthPage(req, res, next) {
  const user = getAuthUserFromRequest(req);
  if (!user) {
    return res.redirect('/');
  }

  req.user = user;
  return next();
}

async function userHasActiveAccess(userId) {
  const result = await pool.query(
    `
      SELECT 1
      FROM twilio_purchases
      WHERE user_id = $1
        AND access_expires_at > NOW()
      LIMIT 1
    `,
    [userId]
  );

  return result.rowCount > 0;
}

async function requirePaidAccess(req, res, next) {
  try {
    const hasAccess = await userHasActiveAccess(req.user.id);
    if (!hasAccess) {
      return res.redirect('/');
    }

    return next();
  } catch (error) {
    console.error('Paid access check error:', error.message);
    return res.redirect('/');
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS twilio_users (
      id BIGSERIAL PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE twilio_users
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_twilio_users_stripe_customer
    ON twilio_users(stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS twilio_purchases (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES twilio_users(id) ON DELETE CASCADE,
      stripe_session_id TEXT NOT NULL UNIQUE,
      amount_cents INT NOT NULL,
      paid_at TIMESTAMPTZ NOT NULL,
      access_expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_twilio_purchases_user_access
    ON twilio_purchases(user_id, access_expires_at DESC);
  `);
}

async function initStripeOfferText() {
  const price = await stripe.prices.retrieve(STRIPE_PRICE_ID, {
    expand: ['product'],
  });
  stripePriceCurrency = String(price.currency || 'usd');

  const productName =
    price.product && typeof price.product === 'object' && price.product.name
      ? price.product.name
      : 'Livestream access';

  if (typeof price.unit_amount === 'number') {
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (price.currency || 'usd').toUpperCase(),
    }).format(price.unit_amount / 100);
    stripeOfferText = `${amount} - ${productName}`;
    return;
  }

  stripeOfferText = productName;
}

async function getOrCreateStripeCustomerId(userId, phone) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      'SELECT stripe_customer_id FROM twilio_users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rowCount === 0) {
      throw new Error('User not found');
    }

    const existingCustomerId = userResult.rows[0].stripe_customer_id;
    if (existingCustomerId) {
      await client.query('COMMIT');
      return existingCustomerId;
    }

    const customer = await stripe.customers.create({
      phone,
      metadata: {
        userId: String(userId),
      },
    });

    await client.query('UPDATE twilio_users SET stripe_customer_id = $1 WHERE id = $2', [
      customer.id,
      userId,
    ]);
    await client.query('COMMIT');
    return customer.id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.get('/auth/me', async (req, res) => {
  try {
    const user = getAuthUserFromRequest(req);
    if (!user) {
      return res.json({ authenticated: false });
    }

    const hasAccess = await userHasActiveAccess(user.id);
    return res.json({
      authenticated: true,
      phone: user.phone,
      hasAccess,
    });
  } catch (error) {
    console.error('Auth me error:', error.message);
    return res.status(500).json({ error: 'Unable to check auth state' });
  }
});

app.get('/api/config', (_req, res) => {
  return res.json(getClientConfig());
});

app.post('/auth/request-code', async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(400).json({ error: 'Valid E.164 phone is required (example: +14155550123)' });
    }

    await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phone, channel: 'sms' });

    return res.json({ success: true });
  } catch (error) {
    console.error('Twilio request-code error:', error.message);
    return res.status(500).json({ error: 'Unable to send login code' });
  }
});

app.post('/auth/verify-code', async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();

    if (!phone || !/^\d+$/.test(code) || code.length !== Number(LOGIN_CODE_LENGTH)) {
      return res.status(400).json({ error: 'Invalid phone or code format' });
    }

    const verificationCheck = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phone, code });

    if (verificationCheck.status !== 'approved') {
      return res.status(401).json({ error: 'Invalid or expired login code' });
    }

    const userResult = await pool.query(
      `
        INSERT INTO twilio_users (phone)
        VALUES ($1)
        ON CONFLICT (phone)
        DO UPDATE SET phone = EXCLUDED.phone
        RETURNING id, phone
      `,
      [phone]
    );

    const user = userResult.rows[0];
    const expiresAtMs = Date.now() + Number(AUTH_SESSION_DAYS) * 24 * 60 * 60 * 1000;
    const authToken = createSignedToken({
      sub: user.id,
      phone: user.phone,
      exp: expiresAtMs,
    });

    setCookie(res, 'auth_token', authToken, Number(AUTH_SESSION_DAYS) * 24 * 60 * 60);

    return res.json({ success: true, authToken });
  } catch (error) {
    console.error('Twilio verify-code error:', error.message);
    return res.status(500).json({ error: 'Unable to verify login code' });
  }
});

app.post('/auth/logout', (_req, res) => {
  clearCookie(res, 'auth_token');
  return res.json({ success: true });
});

app.post('/create-payment-intent', requireAuth, async (req, res) => {
  try {
    const amountCents = Number(req.body?.amountCents);
    const paymentIntentId = String(req.body?.paymentIntentId || '').trim();
    if (!Number.isInteger(amountCents) || amountCents < minPaymentAmountCents) {
      return res.status(400).json({ error: `Amount must be at least ${minPaymentAmountCents} cents` });
    }

    const customerId = await getOrCreateStripeCustomerId(req.user.id, req.user.phone);

    if (paymentIntentId) {
      const existingIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const paidUserId = Number(existingIntent.metadata?.userId || 0);
      const updatableStatuses = new Set([
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
      ]);

      if (paidUserId !== req.user.id) {
        return res.status(403).json({ error: 'Payment intent does not belong to this user' });
      }

      if (updatableStatuses.has(existingIntent.status)) {
        const updatedIntent = await stripe.paymentIntents.update(paymentIntentId, {
          amount: amountCents,
        });

        return res.json({
          clientSecret: updatedIntent.client_secret,
          paymentIntentId: updatedIntent.id,
          reusedExisting: true,
        });
      }
    }

    const intent = await stripe.paymentIntents.create({
      customer: customerId,
      amount: amountCents,
      currency: stripePriceCurrency,
      payment_method_types: ['card'],
      metadata: {
        userId: String(req.user.id),
        phone: req.user.phone,
      },
    });

    return res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      reusedExisting: false,
    });
  } catch (error) {
    console.error('Stripe payment intent error:', error.message);
    return res.status(500).json({ error: 'Unable to start payment' });
  }
});

app.post('/payments/finalize', requireAuth, async (req, res) => {
  try {
    const paymentIntentId = String(req.body?.paymentIntentId || '').trim();
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Missing paymentIntentId' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment has not completed successfully' });
    }

    const paidUserId = Number(paymentIntent.metadata?.userId || 0);
    if (!paidUserId || paidUserId !== req.user.id) {
      return res.status(403).json({ error: 'Payment does not belong to this user' });
    }

    const paidAt = new Date((paymentIntent.created || Math.floor(Date.now() / 1000)) * 1000);
    const accessExpiresAt = new Date(Date.now() + Number(STREAM_ACCESS_HOURS) * 60 * 60 * 1000);

    await pool.query(
      `
        INSERT INTO twilio_purchases (user_id, stripe_session_id, amount_cents, paid_at, access_expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (stripe_session_id) DO NOTHING
      `,
      [req.user.id, paymentIntent.id, Number(paymentIntent.amount_received || paymentIntent.amount || 0), paidAt, accessExpiresAt]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Payment finalization error:', error.message);
    return res.status(500).json({ error: 'Unable to finalize payment' });
  }
});

app.post('/payments/cancel', requireAuth, async (req, res) => {
  try {
    const paymentIntentId = String(req.body?.paymentIntentId || '').trim();
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Missing paymentIntentId' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paidUserId = Number(paymentIntent.metadata?.userId || 0);
    if (!paidUserId || paidUserId !== req.user.id) {
      return res.status(403).json({ error: 'Payment intent does not belong to this user' });
    }

    const cancellableStatuses = new Set([
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'requires_capture',
      'processing',
    ]);

    if (!cancellableStatuses.has(paymentIntent.status)) {
      return res.json({ success: true, cancelled: false, status: paymentIntent.status });
    }

    await stripe.paymentIntents.cancel(paymentIntentId);
    return res.json({ success: true, cancelled: true });
  } catch (error) {
    console.error('Payment cancel error:', error.message);
    return res.status(500).json({ error: 'Unable to cancel payment' });
  }
});

app.get('/success', async (req, res) => {
  const user = getAuthUserFromRequest(req);
  if (!user) {
    return res.redirect('/');
  }

  const { session_id: sessionId } = req.query;
  const returnTo = isAllowedReturnUrl(req.query.return_to) ? req.query.return_to : null;
  if (!sessionId) {
    return res.redirect(returnTo || '/');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.redirect(returnTo || '/');
    }

    const paidUserId = Number(session.metadata?.userId || 0);
    if (!paidUserId || paidUserId !== user.id) {
      return res.redirect(returnTo || '/');
    }

    const paidAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000);
    const accessExpiresAt = new Date(Date.now() + Number(STREAM_ACCESS_HOURS) * 60 * 60 * 1000);

    await pool.query(
      `
        INSERT INTO twilio_purchases (user_id, stripe_session_id, amount_cents, paid_at, access_expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (stripe_session_id) DO NOTHING
      `,
      [user.id, session.id, Number(session.amount_total || 0), paidAt, accessExpiresAt]
    );

    return res.redirect(returnTo || '/livestream');
  } catch (error) {
    console.error('Session verification error:', error.message);
    return res.redirect(returnTo || '/');
  }
});

app.get('/livestream', requireAuthPage, requirePaidAccess, (_req, res) => {
  return res.sendFile(path.join(__dirname, 'private', 'livestream.html'));
});

app.get('/config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(`window.APP_CONFIG = ${JSON.stringify(getClientConfig())};`);
});

initDb()
  .then(() => initStripeOfferText())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on ${BASE_URL}`);
    });
  })
  .catch((error) => {
    console.error('Startup error:', error.message);
    process.exit(1);
  });
