import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { categoryValue } from "@/lib/types";
import { CAR, DASHCAM, daysAgo, SERVICES } from "./sample-data";

type Db = SupabaseClient<Database>;

/**
 * Fills a new demo account with a car owner's records: the car (with its
 * registration and warranty), three services on it, and one other purchase.
 * Runs as the demo user, so row level security applies as it does everywhere.
 * Returns the car's item id.
 */
export async function seedDemo(db: Db): Promise<string> {
  const { data: bought, error } = await db.rpc("create_manual_purchase", {
    purchase: {
      merchant: "Example Motors",
      order_date: daysAgo(CAR.boughtDaysAgo),
      order_ref: "EM-DEMO-0001",
      items: [
        {
          name: CAR.name,
          category: categoryValue("Vehicle"),
          price: CAR.price,
          warranty: { months: CAR.warrantyMonths, state: "confirmed" },
        },
      ],
    } as Json,
  });
  if (error) throw new Error(`seeding the car failed: ${error.message}`);
  const carId = (bought as { item_ids: string[] }).item_ids[0];

  const { error: detailError } = await db
    .from("items")
    .update({
      brand: CAR.brand,
      model: CAR.model,
      identifiers: [
        { label: "Registration", value: CAR.registration },
        { label: "Chassis no.", value: CAR.chassis },
      ],
    })
    .eq("id", carId);
  if (detailError) throw new Error(`seeding the car's details failed: ${detailError.message}`);

  for (const s of SERVICES) {
    const { error: serviceError } = await db.rpc("create_manual_service_event", {
      event: {
        item_id: carId,
        service_date: daysAgo(s.daysAgo),
        work_performed: s.work,
        provider: s.provider,
        total_cost: s.total,
        labour_cost: s.labour,
        odometer_km: s.odometerKm,
        parts: s.parts,
      } as Json,
    });
    if (serviceError) throw new Error(`seeding a service failed: ${serviceError.message}`);
  }

  const { error: camError } = await db.rpc("create_manual_purchase", {
    purchase: {
      merchant: DASHCAM.merchant,
      order_date: daysAgo(DASHCAM.daysAgo),
      items: [
        {
          name: DASHCAM.name,
          category: categoryValue("Electronics"),
          price: DASHCAM.price,
          warranty: { months: 12, state: "confirmed" },
        },
      ],
    } as Json,
  });
  if (camError) throw new Error(`seeding the dashcam failed: ${camError.message}`);
  return carId;
}
