# Paywalled YouTube Livestream (Stripe Checkout + Twilio Verify Phone OTP)

This app provides:
- `GET /`: landing page with phone login-code auth and Stripe Checkout button
- `GET /livestream`: protected page with an embedded YouTube livestream

Access flow:
1. User requests an SMS login code via Twilio Verify.
2. User verifies the code and receives an app auth cookie.
3. Logged-in user pays with Stripe Checkout.
4. Successful payment is recorded in Postgres.
5. `/livestream` is available while access is active.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create env file:
   ```bash
   cp .env.example .env
   ```
3. Fill `.env` values:
   - `DATABASE_URL`: Postgres connection string
   - `STRIPE_SECRET_KEY`: your Stripe secret key
   - `STRIPE_PRICE_ID`: existing Stripe Price ID (for example, `price_...`)
   - `ACCESS_TOKEN_SECRET`: long random secret for signed auth cookies
   - `TWILIO_ACCOUNT_SID`: Twilio account SID
   - `TWILIO_AUTH_TOKEN`: Twilio auth token
   - `TWILIO_VERIFY_SERVICE_SID`: Verify service SID
   - `YOUTUBE_LIVESTREAM_ID`: YouTube livestream/video ID

## Twilio Verify settings

In Twilio Console:
- Create a Verify Service.
- Enable SMS channel.
- The app formats US numbers as-you-type and submits E.164 automatically.

## Database

The app auto-creates required tables on startup.

Optional manual schema file:
- `db/schema.sql`

## Run

```bash
npm start
```

Open `http://localhost:3000`.

## Configuration notes

- `STRIPE_PRICE_ID`: existing Stripe Price ID used for Checkout (linked to your Stripe product).
- `STREAM_ACCESS_HOURS`: access duration after a successful payment.
