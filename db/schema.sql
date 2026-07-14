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
CREATE UNIQUE INDEX IF NOT EXISTS orders_reference_package_unique ON orders (order_reference, package_id);

-- Column added after the table already existed in production — the session
-- a given order row's package refers to (earliest session for a
-- multi-session package like core_full/premium_bundle), shown in the admin
-- buyers table.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id);

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
