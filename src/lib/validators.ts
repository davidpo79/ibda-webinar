import { z } from "zod";

// Accepts common phone formatting characters (+, -, spaces, parens) but
// requires at least 7 actual digits, so junk text (which previously only
// had to pass a bare min-length check) can't be silently stored and
// forwarded to Sumit as the buyer's contact/invoicing phone number.
export const phoneSchema = z
  .string()
  .trim()
  .min(1, "יש להזין טלפון נייד")
  .max(20, "מספר טלפון ארוך מדי")
  .refine((v) => /^[\d+\-\s()]+$/.test(v) && (v.match(/\d/g)?.length ?? 0) >= 7, {
    message: "מספר טלפון לא תקין",
  });

// Israeli ID (ת.ז, 9 digits) or company/dealer number (ח.פ, usually 9
// digits) — digits only, 5-9 characters (5 kept as a floor for older
// records that predate the standard 9-digit format), required for a valid
// tax invoice on any paid package.
export const idNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{5,9}$/, "מספר ת.ז / ח.פ לא תקין — יש להזין ספרות בלבד");
