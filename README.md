# Connect-ZA

Connect-ZA is a modern South African business marketplace PWA with customer accounts, business registration, PRIME paid listing flows, quote requests, real-time chat via server-sent events, WhatsApp contact links, admin moderation, reviews, favorites, and searchable business profiles.

## Run locally

```powershell
npm start
```

Open `http://localhost:3000`.

For a fresh database, create the first admin by setting these environment variables before starting the server:

```env
ADMIN_EMAIL=admin@your-domain.co.za
ADMIN_PASSWORD=replace-with-a-strong-password
ADMIN_NAME=Connect-ZA Admin
ADMIN_PHONE=+27000000000
```

Customers and businesses can register through the live app.

## Connect Supabase

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase/schema.sql`.
3. Create `.env` from `.env.example`.
4. Add your direct Supabase PostgreSQL URL:

```powershell
Copy-Item .env.example .env
```

```env
SUPABASE_DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.cqwutrzqaijbgllrgsqu.supabase.co:5432/postgres
```

5. Restart the server:

```powershell
npm start
```

Replace `[YOUR-PASSWORD]` with the database password from Supabase. If the password contains special characters, URL-encode it first. The app reports the active storage provider from `/api/meta` as `supabase-postgres` when the direct connection is configured. If credentials are missing, it safely falls back to `data/db.json`.

On Render, use Supabase's transaction pooler URL for `SUPABASE_DATABASE_URL`.

You can also connect through Supabase REST instead by setting `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Connect Paystack

1. In your Paystack dashboard, copy your secret key from **Settings > API Keys & Webhooks**.
2. In Render, add these environment variables:

```env
PAYSTACK_SECRET_KEY=sk_live_your_paystack_secret_key
PAYSTACK_CURRENCY=ZAR
```

Use your test secret key while testing and switch to the live secret key after Paystack activates your account.

3. In Paystack, set the webhook URL to:

```text
https://connect-za.com/api/payments/webhook
```

4. The app sends customers to Paystack checkout for Standard and PRIME subscriptions, then verifies the returned transaction reference at `/api/payments/paystack/verify`. Successful Paystack payments are marked as `paid_pending_admin` until an admin approves the subscription.

## Production integration notes

The app is dependency-light and uses Supabase for persistence when configured, with `data/db.json` as local fallback. For a larger production build, split the JSON state into normalized Supabase tables, connect Supabase Auth or another hardened auth service, move gallery uploads to Supabase Storage or S3, and replace the remaining PayFast, Ozow, Yoco, and Stripe placeholders with signed checkout/webhook implementations.

The PWA manifest makes the responsive web app installable. For Android/iOS app-store builds, wrap the web app with Capacitor or migrate the UI flows to React Native/Flutter using the same API contracts.
