"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ServiceEventInput } from "@/app/(app)/add/actions";

// Editing and deleting purchases, items, warranties and service events. Every
// query runs as the signed-in user, so row level security limits it to their rows.

export type ActionResult = { ok: true } | { ok: false; message: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const id = z.uuid();
const money = z.number().nonnegative().max(1e10);
const isoDate = z.iso.date();
const optionalText = (max: number) => z.string().trim().max(max).optional();

const categories = {
  Electronics: "electronics",
  Appliances: "appliances",
  Vehicle: "vehicle",
  Furniture: "furniture",
  Accessories: "accessories",
  Home: "home",
} as const;

const NOT_FOUND: ActionResult = { ok: false, message: "That record no longer exists." };
const INVALID: ActionResult = { ok: false, message: "Please check the details and try again." };

function failed(where: string, error: { message: string; code?: string }): ActionResult {
  console.error(`[records] ${where} failed:`, error.code, error.message);
  return error.code === "P0002" ? NOT_FOUND : { ok: false, message: "Couldn't save. Please try again." };
}

const blankToNull = (v: string | undefined) => (v ? v : null);

/** Removes documents that are no longer attached to anything, from storage and the table. */
async function removeOrphanDocuments(supabase: Supabase, documentIds: string[]) {
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

async function linkedDocumentIds(
  supabase: Supabase,
  column: "order_id" | "item_id" | "service_event_id",
  ids: string[],
) {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("document_links").select("document_id").in(column, ids);
  return (data ?? []).map((l) => l.document_id);
}

// ── Items ───────────────────────────────────────────────────────────────

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: optionalText(100),
  model: optionalText(100),
  category: z.enum(Object.keys(categories) as [keyof typeof categories]),
  purchaseDate: isoDate.optional(),
  price: money.optional(),
  identifiers: z
    .array(z.object({ label: z.string().trim().min(1).max(50), value: z.string().trim().min(1).max(100) }))
    .max(10),
  notes: optionalText(2000),
});

export type ItemInput = z.input<typeof itemSchema>;

export async function updateItem(itemId: string, input: ItemInput): Promise<ActionResult> {
  const parsed = itemSchema.safeParse(input);
  if (!id.safeParse(itemId).success || !parsed.success) return INVALID;
  const i = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({
      name: i.name,
      brand: blankToNull(i.brand),
      model: blankToNull(i.model),
      category: categories[i.category],
      purchase_date: i.purchaseDate ?? null,
      price: i.price ?? null,
      identifiers: i.identifiers,
      notes: blankToNull(i.notes),
      // Saving the form means the user has reviewed every field.
      field_meta: {},
    })
    .eq("id", itemId)
    .select("id");
  if (error) return failed("updateItem", error);
  return data.length ? { ok: true } : NOT_FOUND;
}

const statusSchema = z.enum(["owned", "returned", "sold", "disposed"]);

export async function setItemStatus(itemId: string, status: string): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!id.safeParse(itemId).success || !parsed.success) return INVALID;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ status: parsed.data })
    .eq("id", itemId)
    .select("id");
  if (error) return failed("setItemStatus", error);
  return data.length ? { ok: true } : NOT_FOUND;
}

/** Deletes an item and its service history; its purchase and the purchase's documents stay. */
export async function deleteItem(itemId: string): Promise<ActionResult> {
  if (!id.safeParse(itemId).success) return INVALID;
  const supabase = await createClient();

  const { data: events } = await supabase.from("service_events").select("id").eq("item_id", itemId);
  const docIds = [
    ...(await linkedDocumentIds(supabase, "item_id", [itemId])),
    ...(await linkedDocumentIds(supabase, "service_event_id", (events ?? []).map((e) => e.id))),
  ];

  const { data, error } = await supabase.from("items").delete().eq("id", itemId).select("id");
  if (error) return failed("deleteItem", error);
  if (!data.length) return NOT_FOUND;

  await removeOrphanDocuments(supabase, docIds);
  return { ok: true };
}

// ── Warranties ──────────────────────────────────────────────────────────

const warrantySchema = z.object({
  months: z.number().int().min(1).max(600),
  startsOn: isoDate,
  provider: optionalText(100),
});

export type WarrantyInput = z.input<typeof warrantySchema>;

/** Adds months to a date, clamping to the last day of the month (31 Jan + 1 → 28/29 Feb). */
function addMonths(isoDay: string, months: number) {
  const [y, m, d] = isoDay.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Saves a warranty the user entered themselves (state "confirmed"). */
export async function saveWarranty(itemId: string, input: WarrantyInput): Promise<ActionResult> {
  const parsed = warrantySchema.safeParse(input);
  if (!id.safeParse(itemId).success || !parsed.success) return INVALID;
  const w = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("warranties").upsert(
    {
      item_id: itemId,
      months: w.months,
      starts_on: w.startsOn,
      expires_on: addMonths(w.startsOn, w.months),
      provider: blankToNull(w.provider),
      state: "confirmed",
      evidence: "Entered by you",
      document_id: null,
    },
    { onConflict: "item_id" },
  );
  if (error) return failed("saveWarranty", error);
  return { ok: true };
}

export async function removeWarranty(itemId: string): Promise<ActionResult> {
  if (!id.safeParse(itemId).success) return INVALID;
  const supabase = await createClient();
  const { error } = await supabase.from("warranties").delete().eq("item_id", itemId);
  if (error) return failed("removeWarranty", error);
  return { ok: true };
}

// ── Purchases ───────────────────────────────────────────────────────────

const orderSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
  orderDate: isoDate,
  orderRef: optionalText(100),
  total: money.optional(),
});

export type OrderInput = z.input<typeof orderSchema>;

export async function updateOrder(orderId: string, input: OrderInput): Promise<ActionResult> {
  const parsed = orderSchema.safeParse(input);
  if (!id.safeParse(orderId).success || !parsed.success) return INVALID;
  const o = parsed.data;
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("orders")
    .select("order_date")
    .eq("id", orderId)
    .maybeSingle();
  if (!before) return NOT_FOUND;

  const { error } = await supabase
    .from("orders")
    .update({
      merchant: o.merchant,
      order_date: o.orderDate,
      order_ref: blankToNull(o.orderRef),
      total: o.total ?? null,
      field_meta: {},
    })
    .eq("id", orderId);
  if (error) return failed("updateOrder", error);

  // Items that took their purchase date from the order follow the new date.
  if (before.order_date && before.order_date !== o.orderDate) {
    await supabase
      .from("items")
      .update({ purchase_date: o.orderDate })
      .eq("order_id", orderId)
      .eq("purchase_date", before.order_date);
  }
  return { ok: true };
}

/**
 * Deletes a purchase with its items and their service history, the import it
 * came from, and any documents no longer attached to anything else.
 */
export async function deleteOrder(orderId: string): Promise<ActionResult> {
  if (!id.safeParse(orderId).success) return INVALID;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("import_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return NOT_FOUND;

  const { data: items } = await supabase.from("items").select("id").eq("order_id", orderId);
  const itemIds = (items ?? []).map((i) => i.id);
  const { data: events } = itemIds.length
    ? await supabase.from("service_events").select("id").in("item_id", itemIds)
    : { data: [] };
  const docIds = [
    ...(await linkedDocumentIds(supabase, "order_id", [orderId])),
    ...(await linkedDocumentIds(supabase, "item_id", itemIds)),
    ...(await linkedDocumentIds(supabase, "service_event_id", (events ?? []).map((e) => e.id))),
  ];

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return failed("deleteOrder", error);
  if (order.import_id) await supabase.from("imports").delete().eq("id", order.import_id);

  await removeOrphanDocuments(supabase, [...new Set(docIds)]);
  return { ok: true };
}

// ── Service events ──────────────────────────────────────────────────────

type ServiceEdit = Omit<ServiceEventInput, "itemId" | "importId">;

const serviceEditSchema = z.object({
  serviceDate: isoDate,
  workPerformed: z.string().trim().min(1).max(500),
  provider: optionalText(200),
  totalCost: money,
  labourCost: money.optional(),
  odometerKm: z.number().int().nonnegative().max(10_000_000).optional(),
  notes: optionalText(2000),
  parts: z.array(z.object({ name: z.string().trim().min(1).max(200), cost: money.optional() })).max(50),
});

export async function updateServiceEvent(eventId: string, input: ServiceEdit): Promise<ActionResult> {
  const parsed = serviceEditSchema.safeParse(input);
  if (!id.safeParse(eventId).success || !parsed.success) return INVALID;
  const e = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_service_event", {
    event_id: eventId,
    event: {
      service_date: e.serviceDate,
      work_performed: e.workPerformed,
      provider: e.provider ?? null,
      total_cost: e.totalCost,
      labour_cost: e.labourCost ?? null,
      odometer_km: e.odometerKm ?? null,
      notes: e.notes ?? null,
      parts: e.parts.map((p) => ({ name: p.name, cost: p.cost ?? null })),
    },
  });
  if (error) return failed("update_service_event", error);
  return { ok: true };
}

/** Deletes a service event, the import it came from, and its receipt if nothing else uses it. */
export async function deleteServiceEvent(eventId: string): Promise<ActionResult> {
  if (!id.safeParse(eventId).success) return INVALID;
  const supabase = await createClient();

  const docIds = await linkedDocumentIds(supabase, "service_event_id", [eventId]);
  const { data, error } = await supabase
    .from("service_events")
    .delete()
    .eq("id", eventId)
    .select("import_id");
  if (error) return failed("deleteServiceEvent", error);
  if (!data.length) return NOT_FOUND;

  const importId = data[0].import_id;
  if (importId) await supabase.from("imports").delete().eq("id", importId);
  await removeOrphanDocuments(supabase, docIds);
  return { ok: true };
}
