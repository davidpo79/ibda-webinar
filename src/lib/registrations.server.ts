import { sql } from "./db.server";

export type RegistrationInput = {
  session_id?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  firm_name?: string;
  bar_license?: string;
  selected_packages: string[];
  core_single_lesson_indexes?: number[];
};

export type RegistrationRow = RegistrationInput & {
  id: string;
  session_id: string | null;
  created_at: string;
  session_title: string | null;
  session_starts_at: string | null;
};

export async function recordRegistration(data: RegistrationInput): Promise<string> {
  const lessons = data.core_single_lesson_indexes?.length ? data.core_single_lesson_indexes : null;
  const rows = await sql()<{ id: string }[]>`
    INSERT INTO registrations (
      session_id, first_name, last_name, email, phone, firm_name, bar_license,
      selected_packages, core_single_lesson_indexes
    ) VALUES (
      ${data.session_id ?? null}, ${data.first_name}, ${data.last_name}, ${data.email},
      ${data.phone}, ${data.firm_name ?? null}, ${data.bar_license ?? null}, ${data.selected_packages},
      ${lessons}
    )
    RETURNING id
  `;
  return rows[0].id;
}

// Payment confirmation (webhook/return) only carries email + package_id, not
// a registration id — this resolves the most recent matching submission so
// the post-payment welcome email can pull the buyer's name and (for
// core_single) which lesson(s) they picked.
export async function findRecentRegistrationForPackage(
  email: string,
  packageId: string,
): Promise<RegistrationRow | null> {
  const rows = await sql()<RegistrationRow[]>`
    SELECT
      r.id, r.session_id, r.first_name, r.last_name, r.email, r.phone,
      r.firm_name, r.bar_license, r.selected_packages, r.core_single_lesson_indexes, r.created_at,
      s.title AS session_title, s.starts_at AS session_starts_at
    FROM registrations r
    LEFT JOIN sessions s ON s.id = r.session_id
    WHERE lower(r.email) = lower(${email}) AND ${packageId} = ANY(r.selected_packages)
    ORDER BY r.created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export type RegistrationContactUpdate = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  firm_name?: string;
  bar_license?: string;
};

// Lets the admin correct a lead's contact details from the dashboard — e.g.
// a phone number that ended up pasted into the email field at submission
// time. Doesn't touch selected_packages/session_id.
export async function updateRegistrationContact(
  id: string,
  data: RegistrationContactUpdate,
): Promise<void> {
  await sql()`
    UPDATE registrations SET
      first_name = ${data.first_name},
      last_name = ${data.last_name},
      email = ${data.email},
      phone = ${data.phone},
      firm_name = ${data.firm_name ?? null},
      bar_license = ${data.bar_license ?? null}
    WHERE id = ${id}
  `;
}

// Every submission is its own row — a lead who registers twice (e.g. for a
// later cohort) shows up as two separate entries, not merged by email.
export async function listRegistrations(): Promise<RegistrationRow[]> {
  return sql()<RegistrationRow[]>`
    SELECT
      r.id, r.session_id, r.first_name, r.last_name, r.email, r.phone,
      r.firm_name, r.bar_license, r.selected_packages, r.core_single_lesson_indexes, r.created_at,
      s.title AS session_title, s.starts_at AS session_starts_at
    FROM registrations r
    LEFT JOIN sessions s ON s.id = r.session_id
    ORDER BY r.created_at DESC
  `;
}

// Leads interested in a specific package who haven't already paid for it —
// the audience for the "price is about to rise" notice (see
// src/lib/pricing.server.ts).
export async function listRegistrationsPendingPackage(
  packageId: string,
): Promise<{ email: string; first_name: string }[]> {
  return sql()<{ email: string; first_name: string }[]>`
    SELECT DISTINCT ON (lower(r.email)) r.email, r.first_name
    FROM registrations r
    WHERE ${packageId} = ANY(r.selected_packages)
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE lower(o.email) = lower(r.email) AND o.package_id = ${packageId} AND o.status = 'paid'
      )
    ORDER BY lower(r.email), r.created_at DESC
  `;
}
