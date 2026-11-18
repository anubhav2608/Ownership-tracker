import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { purchaseAutoSave, serviceAutoSave } from "./auto-save";

// Saving what needs no review, kept apart from the reader (no PDF or email code
// here) so pages can use it too: see saveReadyImports in @/lib/data.

type Db = SupabaseClient<Database>;

/** What applyIfClear needs of an import's reading (as recorded, or as just read). */
export interface ReadingOutcome {
  status: string;
  document_kind?: string | null;
  extracted?: Json;
  review_reasons?: string[];
  candidates?: Json;
}

/** The database doesn't have this function yet (its migration isn't applied). */
const missingFunction = (e: { code?: string }) => e.code === "PGRST202" || e.code === "42883";

/**
 * After a reading is recorded: saves the service or purchase, or applies the
 * refund, when nothing needs the user (see ./auto-save.ts). `owner` is given
 * when acting for the account (the webhook); a signed-in user's own client
 * leaves it out. Never throws: if it fails, the import simply waits for review.
 */
export async function applyIfClear(db: Db, importId: string, outcome: ReadingOutcome, owner?: string): Promise<boolean> {
  const reading = outcome as Parameters<typeof serviceAutoSave>[0];

  // A service invoice read accurately and matched to one car (or to none): saved now.
  const service = serviceAutoSave(reading);
  if (service) {
    const { error } = await db.rpc("auto_save_service_import", { import_id: importId, event: service.event, owner });
    if (error) console.error("[imports] saving a service automatically failed:", error.code, error.message);
    return !error;
  }

  // An order or invoice read accurately, with nothing to resolve: saved now. A
  // purchase already saved (same order or invoice number) is refused, so it waits.
  const purchase = purchaseAutoSave(reading);
  if (purchase) {
    let { error } = await db.rpc("auto_save_purchase_import", {
      import_id: importId,
      purchases: purchase.purchases,
      owner,
    });
    // Before that migration is applied, a signed-in user saves it as "Confirm and save" does.
    if (error && missingFunction(error) && !owner) {
      ({ error } = await db.rpc("create_purchases_from_import", { import_id: importId, purchases: purchase.purchases }));
    }
    if (error) console.error("[imports] saving a purchase automatically failed:", error.code, error.message);
    return !error;
  }

  const x = outcome.extracted as
    | {
        fields?: { total?: { value: number | null }; date?: { value: string | null }; outcome?: { value: string } };
        refund?: { order_id: string; item_ids: string[]; auto?: boolean } | null;
      }
    | undefined;
  const r = x?.refund;
  if (outcome.status !== "needs_review" || !r?.auto || x?.fields?.total?.value == null) return false;
  const { error } = await db.rpc("auto_apply_refund_import", {
    import_id: importId,
    order_id: r.order_id,
    item_ids: r.item_ids,
    outcome: x.fields.outcome?.value === "cancelled" ? "cancelled" : "returned",
    refund: x.fields.total.value,
    happened_on: x.fields.date?.value ?? undefined,
    owner,
  });
  if (error) console.error("[imports] applying a refund automatically failed:", error.code, error.message);
  return !error;
}

/**
 * Saves every import of the signed-in user that is waiting for review but needs
 * none: read before auto-saving covered it, or when saving it failed (say, a
 * migration not yet applied). Returns how many were saved.
 */
export async function saveReadyImports(db: Db): Promise<number> {
  const { data, error } = await db
    .from("imports")
    .select("id, status, document_kind, extracted, review_reasons, candidates")
    .eq("status", "needs_review")
    .limit(50);
  if (error || !data) return 0;
  let saved = 0;
  // One at a time: two imports of the same order must not race each other.
  for (const row of data) {
    const ready = serviceAutoSave(row as never) || purchaseAutoSave(row as never);
    if (ready && (await applyIfClear(db, row.id, row))) saved++;
  }
  return saved;
}
