# Paywalled YouTube Livestream (Stripe Elements + Twilio Verify Phone OTP)

This app provides:
- `GET /`: sample host page with the embeddable widget mounted
- `GET /embed-widget.js`: embeddable widget script
- `GET /livestream`: protected page with an embedded YouTube livestream

Access flow:
1. User requests an SMS login code via Twilio Verify.
2. User verifies the code and receives an app auth cookie.
3. Logged-in user pays inline with Stripe Elements, choosing a preset or custom amount.
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
   - `STRIPE_PUBLISHABLE_KEY`: your Stripe publishable key
   - `STRIPE_PRICE_ID`: existing Stripe Price ID (for example, `price_...`)
   - `MIN_PAYMENT_AMOUNT_USD_CENTS`: minimum allowed payment amount
   - `SUGGESTED_AMOUNTS_USD_CENTS`: comma-separated preset amounts for the widget
   - `EVENT_START_TIME`: event start time in ISO-8601 format
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

## Widget usage

```html
<div id="livestream-widget"></div>
<script src="https://your-app.example.com/embed-widget.js"></script>
<script>
  window.LionAndSunWidget.mount('#livestream-widget', {
    apiBase: 'https://your-app.example.com',
    title: 'Livestream Access'
  });
</script>
```

## Configuration notes

- `STRIPE_PRICE_ID`: existing Stripe Price ID used to derive the offer label shown in the widget.
- `MIN_PAYMENT_AMOUNT_USD_CENTS`: minimum payment amount enforced server-side.
- `SUGGESTED_AMOUNTS_USD_CENTS`: preset payment options shown in the widget.
- `EVENT_START_TIME`: drives the live countdown shown at the top of the widget.
- `STREAM_ACCESS_HOURS`: access duration after a successful payment.
- `AUTH_COOKIE_SAME_SITE`: set to `None` for cross-site embeds over HTTPS.
- `EMBED_ALLOWED_ORIGINS`: comma-separated origins allowed to embed the widget and send credentialed API requests.
