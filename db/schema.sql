-- Idempotent — applied at container boot (see scripts/start.mjs). Safe to
-- run on every deploy: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('open', 'core', 'premium')),
  key text,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  zoom_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Column added after the table already existed in production — safe to
-- re-run (IF NOT EXISTS guards it).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS zoom_url text;

-- 'core'/'premium' sessions used to be fixed single slots (one row per key),
-- but the admin can now schedule a new future cohort for any lesson or
-- workshop without losing the old one (mirrors how 'open' cohorts already
-- worked) — so `key` is no longer unique. src/lib/schedule.server.ts always
-- resolves "the" session for a key as the soonest upcoming row sharing it
-- (falling back to the most recent past one), never assuming a single row.
DROP INDEX IF EXISTS sessions_key_unique;

CREATE TABLE IF NOT EXISTS registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  firm_name text,
  bar_license text,
  selected_packages text[] NOT NULL DEFAULT '{}',
  core_single_lesson_index int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Column added after the table already existed in production.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS core_single_lesson_index int;

-- core_single is now a multi-select ("buy N individual lessons in one
-- purchase") rather than a single dropdown pick — this array is the current
-- source of truth going forward; the older singular column above is kept
-- for rows recorded before this changed (readers fall back to wrapping it
-- in a one-element array when the plural column is empty).
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS core_single_lesson_indexes int[];

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference text NOT NULL,
  transaction_id text,
  email text NOT NULL,
  package_id text NOT NULL,
  amount numeric,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A multi-package purchase (one Sumit transaction) used to be stored as a
-- single row with a comma-joined package_id; it's now one row per package so
-- the admin buyers table can show each product with its own session date.
-- Drop the old single-column uniqueness and replace it with
-- (order_reference, package_id), which still prevents duplicate inserts on
-- webhook retries without collapsing separate packages into one row.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_reference_key;
DROP INDEX IF EXISTS orders_reference_package_unique;

-- Column added after the table already existed in production — the session
-- a given order row's package refers to (earliest session for a
-- multi-session package like core_full/premium_bundle), shown in the admin
-- buyers table.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id);

-- core_single can now be bought as several distinct lessons in one purchase
-- (see core_single_lesson_indexes below) — each lesson gets its own order
-- row sharing package_id='core_single' but a different session_id, so the
-- uniqueness key needs session_id too (order_reference, package_id) alone
-- would collide on the second lesson row.
CREATE UNIQUE INDEX IF NOT EXISTS orders_reference_package_session_unique
  ON orders (order_reference, package_id, session_id);

-- Which coupon (if any) was applied to this order — a per-lead single-use
-- coupon is only marked used once the order actually reaches 'paid' (see
-- src/lib/coupons.server.ts), never at payment-page-creation time.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;

-- One row per (registration, package) that needs a "day before" reminder
-- email. Populated at registration time; the in-process scheduler
-- (src/lib/reminders.server.ts) polls for rows whose session is imminent
-- and not yet sent, then marks sent_at so a redeploy never double-sends.
CREATE TABLE IF NOT EXISTS registration_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES registrations(id),
  package_id text NOT NULL,
  session_id uuid REFERENCES sessions(id),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_id, package_id)
);

-- A core_single purchase can now cover several distinct lessons at once,
-- each needing its own "day before" reminder (different date, different
-- Zoom link) — so the old (registration_id, package_id) uniqueness, which
-- only allowed one reminder per package per registration, is replaced with
-- one that also includes session_id.
ALTER TABLE registration_reminders DROP CONSTRAINT IF EXISTS registration_reminders_registration_id_package_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS registration_reminders_unique
  ON registration_reminders (registration_id, package_id, session_id);

-- Seed the current site's hardcoded dates so behavior is unchanged on first
-- deploy — only the source of the dates moves into the database. Guarded by
-- key existence (not a unique constraint, now that a key can have several
-- cohort rows) so this never re-seeds a key the admin has already touched.
INSERT INTO sessions (type, key, title, starts_at, sort_order)
SELECT v.type, v.key, v.title, v.starts_at::timestamptz, v.sort_order
FROM (VALUES
  ('core', 'core_1', 'המפה המשפטית', '2026-07-26T10:00:00+03:00', 1),
  ('core', 'core_2', 'דגשים בבדיקות מקדמיות', '2026-07-27T10:00:00+03:00', 2),
  ('core', 'core_3', 'לב העסקה - חלק א''', '2026-07-28T10:00:00+03:00', 3),
  ('core', 'core_4', 'לב העסקה - חלק ב''', '2026-07-30T10:00:00+03:00', 4),
  ('core', 'core_5', 'המשכנתא', '2026-08-03T10:00:00+03:00', 5),
  ('core', 'core_6', 'מעמד החתימה ורישום הזכויות', '2026-08-04T10:00:00+03:00', 6),
  ('core', 'core_7', 'הסכם השכירות', '2026-08-09T10:00:00+03:00', 7),
  ('core', 'core_8', 'פינוי מושכר', '2026-08-11T10:00:00+03:00', 8),
  ('core', 'core_9', 'העסקה שהשתבשה: ביטול, אכיפה וסעדים זמניים', '2026-08-12T10:00:00+03:00', 9),
  ('premium', 'premium_ai', 'AI ואוטומציות בעבודת עורך הדין', '2026-07-21T10:00:00+03:00', 1),
  ('premium', 'premium_registration', 'רישום בית משותף', '2026-08-13T09:00:00+03:00', 2),
  ('premium', 'premium_litigation', 'ליטיגציה בנדל״ן - סוגיות נבחרות', '2026-08-16T10:00:00+03:00', 3),
  ('premium', 'premium_partnership', 'שיתוף במקרקעין', '2026-08-17T10:00:00+03:00', 4)
) AS v(type, key, title, starts_at, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.key = v.key);

-- The 'open' seed row has no key, so it needs its own existence guard —
-- separate from the core/premium block above, so re-running this file
-- doesn't insert duplicate cohorts.
INSERT INTO sessions (type, key, title, starts_at, sort_order)
SELECT 'open', NULL, 'כמה זה עולה לעשות עסקת נדל״ן?', '2026-07-15T10:00:00+03:00', 0
WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE type = 'open');

-- Zoom links (from the IBDA email-automation spec, section 12 — with the
-- litigation link's ActiveCampaign duplication bug fixed: the correct URL is
-- the one from that workshop's own standalone registration email).
-- UPDATEs (not INSERT ... ON CONFLICT) so they backfill rows that already
-- existed in production before this column was added. core_6's link has a
-- visual O/0 ambiguity in the original source font — kept as documented,
-- flagged for the admin to double check against the Zoom dashboard.
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/sE3qcdizSGChPtZFva7aWg' WHERE key = 'core_1';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/uvh25IaQSfiTRCCWURnRGQ' WHERE key = 'core_2';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/gPM53MZFRRaLAvYvA3Q1Kg' WHERE key = 'core_3';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/EppiZmpHQCOKYr48_au_-A' WHERE key = 'core_4';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/kT436qzIRzORIPIJw2zm8A' WHERE key = 'core_5';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/lU441LmsT8eO0dex7yrrfA' WHERE key = 'core_6';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/ErIK1OPaS7GZmtQHrb2gQw' WHERE key = 'core_7';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/_-3TtbAmQgmtTBJxZwf9OA' WHERE key = 'core_8';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/vYsiofPBTJKymO0X2zFb2A' WHERE key = 'core_9';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/JdBxDoxjQR-boHysGROp_A' WHERE key = 'premium_ai';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/x3vXG_stS1CeH-Wzt_lLFg' WHERE key = 'premium_registration';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/4b2oHZsWTfm8O-UPVVn7Bw' WHERE key = 'premium_litigation';
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/meeting/register/6wt1qTewQByjO_DwU8KpGg' WHERE key = 'premium_partnership';
-- Fixed personal Zoom room (Personal Meeting ID + embedded password) reused
-- for every open-webinar cohort, not a per-cohort registration link.
UPDATE sessions SET zoom_url = 'https://us02web.zoom.us/j/83035753700?pwd=BgqbH9xvxrV7IcPJaZqBfvE4zG8PtG.1' WHERE type = 'open' AND zoom_url IS NULL;

-- Discount codes. `registration_id` NULL = a reusable generic code the admin
-- created from the coupons screen; non-NULL = a single-use code generated
-- for one specific lead and emailed directly to them (marked used only once
-- their order actually reaches 'paid' — see src/lib/coupons.server.ts).
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_percent int NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  registration_id uuid REFERENCES registrations(id),
  active boolean NOT NULL DEFAULT true,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-package early/regular price and an optional cutoff after which the
-- regular price takes effect automatically. `cutoff_at IS NULL` means "stay
-- at the early price indefinitely" — matches the site's actual behavior
-- before this table existed, so seeding it doesn't change anything until an
-- admin deliberately sets a cutoff from /admin/pricing.
-- price_increase_notified_at guards the 12-hours-before email (see
-- src/lib/pricing.server.ts) against duplicate sends; it's reset to NULL
-- whenever the admin edits the cutoff, so rescheduling allows a fresh notice.
CREATE TABLE IF NOT EXISTS package_pricing (
  package_id text PRIMARY KEY,
  early_price numeric NOT NULL,
  regular_price numeric NOT NULL,
  cutoff_at timestamptz,
  price_increase_notified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seeded from the prices already hardcoded on the site (PACKAGE_PRICES in
-- sumit.server.ts was the "early" figure; the crossed-out marketing price
-- in index.tsx/thank-you.tsx was "regular") — this table becomes the single
-- source of truth for both going forward.
INSERT INTO package_pricing (package_id, early_price, regular_price) VALUES
  ('core_single', 180, 360),
  ('core_full', 1620, 2520),
  ('premium_litigation', 360, 480),
  ('premium_registration', 1080, 1440),
  ('premium_partnership', 540, 720),
  ('premium_ai', 360, 480),
  ('premium_bundle', 2700, 3720)
ON CONFLICT (package_id) DO NOTHING;

-- Singleton table (the `id boolean ... CHECK (id)` trick guarantees exactly
-- one row) controlling when the automated schedulers (day-before reminders,
-- price-increase notices) are allowed to actually send — so the admin can
-- block Shabbat/holidays and set allowed hours from /admin/settings.
-- blocked_weekdays: 0=Sunday..6=Saturday (default: Saturday only).
-- blocked_dates: specific extra dates (holidays) the admin adds/removes.
CREATE TABLE IF NOT EXISTS email_send_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  blocked_weekdays int[] NOT NULL DEFAULT '{6}',
  allowed_hour_start int NOT NULL DEFAULT 8,
  allowed_hour_end int NOT NULL DEFAULT 21,
  blocked_dates date[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO email_send_policy (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
