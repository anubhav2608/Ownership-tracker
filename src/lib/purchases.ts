import "server-only";
import type { createClient } from "@/lib/supabase/server";

// Helpers shared by the actions that save, replace and delete purchases. They
// run with the signed-in user's client, so row level security scopes them.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Removes documents that are no longer attached to anything, from storage and the table. */
export async function removeOrphanDocuments(supabase: Supabase, documentIds: string[]) {
  if (documentIds.length === 0) return;
  const { data: stillLinked } = await supabase
    .from("document_links")
    .select("document_id")
    .in("document_id", documentIds);
  const linked = new Set((stillLinked ?? []).map((l) => l.document_id));
  const orphanIds = documentIds.filter((d) => !linked.has(d));
  if (orphanIds.length === 0) return;

  const { data: docs } = await supabase.from("documents").select("id, storage_path").in("id", orphanIds);
  if (docs?.length) await supabase.storage.from("documents").remove(docs.map((d) => d.storage_path));
  await supabase.from("documents").delete().in("id", orphanIds);
}

export async function linkedDocumentIds(
  supabase: Supabase,
  column: "order_id" | "item_id" | "service_event_id",
  ids: string[],
) {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("document_links").select("document_id").in(column, ids);
  return (data ?? []).map((l) => l.document_id);
}

/** Documents attached to a purchase, its items, or their service history. */
export async function purchaseDocumentIds(supabase: Supabase, orderId: string) {
  const { data: items } = await supabase.from("items").select("id").eq("order_id", orderId);
  const itemIds = (items ?? []).map((i) => i.id);
  const { data: events } = itemIds.length
    ? await supabase.from("service_events").select("id").in("item_id", itemIds)
    : { data: [] };
  const ids = [
    ...(await linkedDocumentIds(supabase, "order_id", [orderId])),
    ...(await linkedDocumentIds(supabase, "item_id", itemIds)),
    ...(await linkedDocumentIds(supabase, "service_event_id", (events ?? []).map((e) => e.id))),
  ];
  return { documentIds: [...new Set(ids)], itemCount: itemIds.length, serviceCount: events?.length ?? 0 };
}

/** Exact, case-insensitive match for ilike: escape its wildcards. */
const exactly = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ExistingPurchase {
  id: string;
  merchant: string;
  orderDate: string | null;
  total: number | null;
  orderRef: string | null;
  invoiceRef: string | null;
  /** Which number matched. */
  matchedOn: "order" | "invoice";
  itemCount: number;
  serviceCount: number;
}

/** The purchase that already has this order or invoice number, if any (other than `exceptId`). */
export async function purchaseWithNumbers(
  supabase: Supabase,
  orderRef: string | null | undefined,
  invoiceRef: string | null | undefined,
  exceptId?: string,
): Promise<ExistingPurchase | null> {
  const checks: ["order" | "invoice", "order_ref" | "invoice_ref", string][] = [];
  if (orderRef?.trim()) checks.push(["order", "order_ref", orderRef.trim()]);
  if (invoiceRef?.trim()) checks.push(["invoice", "invoice_ref", invoiceRef.trim()]);

  for (const [matchedOn, column, value] of checks) {
    let query = supabase
      .from("orders")
      .select("id, merchant, order_date, total, order_ref, invoice_ref")
      .ilike(column, exactly(value));
    if (exceptId) query = query.neq("id", exceptId);
    const { data } = await query.limit(1).maybeSingle();
    if (data) {
      const { itemCount, serviceCount } = await purchaseDocumentIds(supabase, data.id);
      return {
        id: data.id,
        merchant: data.merchant,
        orderDate: data.order_date,
        total: data.total,
        orderRef: data.order_ref,
        invoiceRef: data.invoice_ref,
        matchedOn,
        itemCount,
        serviceCount,
      };
    }
  }
  return null;
}
