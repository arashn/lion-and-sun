const crypto = require('crypto');
const path = require('path');

const dotenv = require('dotenv');
const express = require('express');
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
  STRIPE_PRICE_ID,
  STREAM_ACCESS_HOURS = '24',
  LOGIN_CODE_LENGTH = '6',
  AUTH_SESSION_DAYS = '30',
  ACCESS_TOKEN_SECRET,
  YOUTUBE_LIVESTREAM_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID,
} = process.env;

if (!DATABASE_URL) {
  throw new Error('Missing DATABASE_URL');
}
if (!STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}
if (!STRIPE_PRICE_ID) {
  throw new Error('Missing STRIPE_PRICE_ID');
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function normalizePhone(rawPhone) {
  const phone = String(rawPhone || '').trim();
  const isValid = /^\+[1-9]\d{7,14}$/.test(phone);
  return isValid ? phone : null;
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

function setCookie(res, key, value, maxAgeSeconds) {
  const secure = BASE_URL.startsWith('https://');
  res.setHeader(
    'Set-Cookie',
    `${key}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${
      secure ? '; Secure' : ''
    }`
  );
}

function clearCookie(res, key) {
  const secure = BASE_URL.startsWith('https://');
  res.setHeader(
    'Set-Cookie',
    `${key}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
  );
}

function getAuthUserFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const authToken = cookies.auth_token;
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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

    return res.json({ success: true });
  } catch (error) {
    console.error('Twilio verify-code error:', error.message);
    return res.status(500).json({ error: 'Unable to verify login code' });
  }
});

app.post('/auth/logout', (_req, res) => {
  clearCookie(res, 'auth_token');
  return res.json({ success: true });
});

app.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      metadata: {
        userId: String(req.user.id),
        phone: req.user.phone,
      },
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?canceled=1`,
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe session error:', error.message);
    return res.status(500).json({ error: 'Unable to start checkout' });
  }
});

app.get('/success', async (req, res) => {
  const user = getAuthUserFromRequest(req);
  if (!user) {
    return res.redirect('/');
  }

  const { session_id: sessionId } = req.query;
  if (!sessionId) {
    return res.redirect('/');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.redirect('/');
    }

    const paidUserId = Number(session.metadata?.userId || 0);
    if (!paidUserId || paidUserId !== user.id) {
      return res.redirect('/');
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

    return res.redirect('/livestream');
  } catch (error) {
    console.error('Session verification error:', error.message);
    return res.redirect('/');
  }
});

app.get('/livestream', requireAuthPage, requirePaidAccess, (_req, res) => {
  return res.sendFile(path.join(__dirname, 'private', 'livestream.html'));
});

app.get('/config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(`window.APP_CONFIG = ${JSON.stringify({
    offerText: stripeOfferText,
    streamAccessHours: Number(STREAM_ACCESS_HOURS),
    youtubeLivestreamId: YOUTUBE_LIVESTREAM_ID,
    loginCodeLength: Number(LOGIN_CODE_LENGTH),
  })};`);
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
