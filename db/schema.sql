CREATE TABLE IF NOT EXISTS twilio_users (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_twilio_users_stripe_customer
ON twilio_users(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS twilio_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES twilio_users(id) ON DELETE CASCADE,
  stripe_session_id TEXT NOT NULL UNIQUE,
  amount_cents INT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twilio_purchases_user_access
ON twilio_purchases(user_id, access_expires_at DESC);
