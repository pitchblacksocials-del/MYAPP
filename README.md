# Connect-ZA

Connect-ZA is a modern South African business marketplace PWA with customer accounts, business registration, PRIME paid listing flows, quote requests, real-time chat via server-sent events, WhatsApp contact links, admin moderation, reviews, favorites, and searchable business profiles.

## Run locally

```powershell
npm start
```

Open `http://localhost:3000`.

Demo logins:

- Admin: `admin@connect-za.local` / `Admin123!`
- Customer: `customer@connect-za.local` / `Customer123!`
- Business: `business@connect-za.local` / `Business123!`

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

You can also connect through Supabase REST instead by setting `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Production integration notes

The app is dependency-light and uses Supabase for persistence when configured, with `data/db.json` as local fallback. For a larger production build, split the JSON state into normalized Supabase tables, connect Supabase Auth or another hardened auth service, move gallery uploads to Supabase Storage or S3, and replace `/api/payments/prime` plus `/api/payments/webhook` with signed PayFast, Ozow, Yoco, and Stripe checkout/webhook implementations.

The PWA manifest makes the responsive web app installable. For Android/iOS app-store builds, wrap the web app with Capacitor or migrate the UI flows to React Native/Flutter using the same API contracts.
