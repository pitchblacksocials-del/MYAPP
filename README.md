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
2. Open the Supabase SQL editor and run `supabase/schema.sql`, then run `supabase/storage.sql`.
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

Replace `[YOUR-PASSWORD]` with the database password from Supabase. If the password contains special characters, URL-encode it first. The app reports the active storage provider from `/api/meta` as `supabase-postgres` when the database connection is working. If credentials are missing locally, it can fall back to `data/db.json`.

On Render, use Supabase's transaction or session pooler URL for `SUPABASE_DATABASE_URL`. Render does not support Supabase's IPv6-only direct database endpoint, so the direct `db.[project].supabase.co:5432` URL can fail on Render. If your database password contains special characters such as `@`, URL-encode them before saving the connection string in Render.

Do not enable `ALLOW_LOCAL_DB_FALLBACK` on Render. If Supabase is configured but unreachable, the app should fail loudly instead of saving new users or businesses to Render's temporary filesystem.

Set this on Render so the app never uses local JSON storage in production:

```env
REQUIRE_SUPABASE_DATABASE=true
```

You can also connect through Supabase REST instead by setting `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Connect Supabase Storage

Business logos, banner images, project galleries, quote files, and verification documents are uploaded to Supabase Storage before the business or quote record is saved.

The app can create/update the buckets automatically when `/api/meta` is called, or you can create them manually by running `supabase/storage.sql`:

```text
connect-za-media    public bucket for profile, banner, and project images
connect-za-private  private bucket for proof documents and quote attachments
```

On Render, add:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=connect-za-media
SUPABASE_PRIVATE_STORAGE_BUCKET=connect-za-private
```

Do not enable `ALLOW_INLINE_UPLOAD_FALLBACK` on Render. If Supabase Storage is not configured, uploads should fail instead of being saved inline in the database.

## Connect Yoco

1. In the Yoco App, open the Yoco payment gateway/API keys area and copy your secret key.
2. In Render, add:

```env
YOCO_SECRET_KEY=sk_live_your_yoco_secret_key
YOCO_CURRENCY=ZAR
```

Use `sk_test_...` while testing, then switch to `sk_live_...` for production.
In Render, the key name is `YOCO_SECRET_KEY` and the value must be only the secret key. Do not paste `YOCO_SECRET_KEY=` into the value, do not use the webhook secret, and do not wrap the key in quotes.

3. Register one Yoco Checkout webhook pointing to:

```text
https://connect-za.com/webhooks/yoco
```

Yoco returns a webhook secret once when the webhook is created. Save it in Render as:

```env
YOCO_WEBHOOK_SECRET=whsec_your_yoco_webhook_secret
```

4. Redeploy the Render service. The app uses Yoco for all Standard and PRIME subscriptions and waits for Yoco's signed `payment.succeeded` webhook before marking the subscription as `paid_pending_admin`.

### Yoco payment troubleshooting

- Open `/api/meta?payment-debug=1` and confirm `paymentStatus.checkoutConfigured` is `true`, `keyMode` is `live`, and `webhookConfigured` is `true`.
- In the admin dashboard, use **Check Yoco webhook** to confirm Yoco has `https://connect-za.com/webhooks/yoco` or `https://www.connect-za.com/webhooks/yoco` registered. If it is missing, use **Create Connect-ZA webhook**, then copy the returned `whsec_...` value into Render as `YOCO_WEBHOOK_SECRET` and redeploy.
- If Yoco shows a card decline, the checkout reached Yoco and the decline is normally caused by the card, 3D Secure, merchant activation/KYC, or using a real card against a test key.
- Test-mode payments do not appear in Yoco sales reports. Use `sk_live_...` for real transactions and `sk_test_...` only with Yoco test card details.

## Production integration notes

The app is dependency-light and uses Supabase for persistence when configured, with `data/db.json` only for local fallback. For a larger production build, split the JSON state into normalized Supabase tables and connect Supabase Auth or another hardened auth service.

The PWA manifest makes the responsive web app installable. For Android/iOS app-store builds, wrap the web app with Capacitor or migrate the UI flows to React Native/Flutter using the same API contracts.
