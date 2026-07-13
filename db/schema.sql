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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 'core'/'premium' sessions are fixed single slots (one row per key, ever);
-- 'open' cohorts repeat over time with no fixed key, so the uniqueness only
-- applies where a key is actually set.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_key_unique ON sessions (key) WHERE key IS NOT NULL;

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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference text UNIQUE NOT NULL,
  transaction_id text,
  email text NOT NULL,
  package_id text NOT NULL,
  amount numeric,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the current site's hardcoded dates so behavior is unchanged on first
-- deploy — only the source of the dates moves into the database.
INSERT INTO sessions (type, key, title, starts_at, sort_order) VALUES
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
ON CONFLICT (key) WHERE key IS NOT NULL DO NOTHING;

-- The 'open' seed row has no key, so the ON CONFLICT above can't guard it —
-- guard separately so re-running this file doesn't insert duplicate cohorts.
INSERT INTO sessions (type, key, title, starts_at, sort_order)
SELECT 'open', NULL, 'כמה זה עולה לעשות עסקת נדל״ן?', '2026-07-15T10:00:00+03:00', 0
WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE type = 'open');
