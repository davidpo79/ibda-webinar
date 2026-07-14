import { sql } from "./db.server";

export type PackagePricingRow = {
  package_id: string;
  early_price: string;
  regular_price: string;
  cutoff_at: string | null;
  price_increase_notified_at: string | null;
  updated_at: string;
};

export async function getAllPackagePricing(): Promise<PackagePricingRow[]> {
  return sql()<PackagePricingRow[]>`SELECT * FROM package_pricing ORDER BY package_id`;
}

// The price actually charged right now for every package: early_price until
// (if ever) cutoff_at passes, then regular_price. A package with no pricing
// row (shouldn't happen after the schema seed) is simply absent from the
// result — callers already treat a missing price as "unknown package".
export async function getCurrentPrices(): Promise<Record<string, number>> {
  const rows = await getAllPackagePricing();
  const now = Date.now();
  const out: Record<string, number> = {};
  for (const r of rows) {
    const risen = Boolean(r.cutoff_at) && new Date(r.cutoff_at!).getTime() <= now;
    out[r.package_id] = Number(risen ? r.regular_price : r.early_price);
  }
  return out;
}

export async function updatePackagePricing(
  packageId: string,
  data: { earlyPrice: number; regularPrice: number; cutoffAt: string | null },
): Promise<void> {
  await sql()`
    UPDATE package_pricing SET
      early_price = ${data.earlyPrice},
      regular_price = ${data.regularPrice},
      cutoff_at = ${data.cutoffAt},
      price_increase_notified_at = NULL,
      updated_at = now()
    WHERE package_id = ${packageId}
  `;
}
