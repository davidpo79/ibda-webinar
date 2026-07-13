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
  core_single_lesson_index?: number;
};

export type RegistrationRow = RegistrationInput & {
  id: string;
  session_id: string | null;
  created_at: string;
  session_title: string | null;
  session_starts_at: string | null;
};

export async function recordRegistration(data: RegistrationInput): Promise<string> {
  const rows = await sql()<{ id: string }[]>`
    INSERT INTO registrations (
      session_id, first_name, last_name, email, phone, firm_name, bar_license,
      selected_packages, core_single_lesson_index
    ) VALUES (
      ${data.session_id ?? null}, ${data.first_name}, ${data.last_name}, ${data.email},
      ${data.phone}, ${data.firm_name ?? null}, ${data.bar_license ?? null}, ${data.selected_packages},
      ${data.core_single_lesson_index ?? null}
    )
    RETURNING id
  `;
  return rows[0].id;
}

// Payment confirmation (webhook/return) only carries email + package_id, not
// a registration id — this resolves the most recent matching submission so
// the post-payment welcome email can pull the buyer's name and (for
// core_single) which lesson they picked.
export async function findRecentRegistrationForPackage(
  email: string,
  packageId: string,
): Promise<RegistrationRow | null> {
  const rows = await sql()<RegistrationRow[]>`
    SELECT
      r.id, r.session_id, r.first_name, r.last_name, r.email, r.phone,
      r.firm_name, r.bar_license, r.selected_packages, r.core_single_lesson_index, r.created_at,
      s.title AS session_title, s.starts_at AS session_starts_at
    FROM registrations r
    LEFT JOIN sessions s ON s.id = r.session_id
    WHERE lower(r.email) = lower(${email}) AND ${packageId} = ANY(r.selected_packages)
    ORDER BY r.created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// Every submission is its own row — a lead who registers twice (e.g. for a
// later cohort) shows up as two separate entries, not merged by email.
export async function listRegistrations(): Promise<RegistrationRow[]> {
  return sql()<RegistrationRow[]>`
    SELECT
      r.id, r.session_id, r.first_name, r.last_name, r.email, r.phone,
      r.firm_name, r.bar_license, r.selected_packages, r.core_single_lesson_index, r.created_at,
      s.title AS session_title, s.starts_at AS session_starts_at
    FROM registrations r
    LEFT JOIN sessions s ON s.id = r.session_id
    ORDER BY r.created_at DESC
  `;
}
