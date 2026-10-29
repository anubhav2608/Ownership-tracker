"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  linkedDocumentIds,
  purchaseDocumentIds,
  purchaseWithNumbers,
  removeOrphanDocuments,
} from "@/lib/purchases";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, categoryValue } from "@/lib/types";
import type { ServiceEventInput } from "@/app/(app)/add/actions";

// Editing and deleting purchases, items, warranties and service events. Every
// query runs as the signed-in user, so row level security limits it to their rows.

export type ActionResult = { ok: true } | { ok: false; message: string };

const id = z.uuid();
const money = z.number().nonnegative().max(1e10);
const isoDate = z.iso.date();
const optionalText = (max: number) => z.string().trim().max(max).optional();

const NOT_FOUND: ActionResult = { ok: false, message: "That record no longer exists." };
const INVALID: ActionResult = { ok: false, message: "Please check the details and try again." };

function failed(where: string, error: { message: string; code?: string }): ActionResult {
  console.error(`[records] ${where} failed:`, error.code, error.message);
  return error.code === "P0002" ? NOT_FOUND : { ok: false, message: "Couldn't save. Please try again." };
}

const blankToNull = (v: string | undefined) => (v ? v : null);

// ── Items ───────────────────────────────────────────────────────────────

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: optionalText(100),
  model: optionalText(100),
  category: z.enum(CATEGORIES),
  purchaseDate: isoDate.optional(),
  returnBy: isoDate.optional(),
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
      category: categoryValue(i.category),
      purchase_date: i.purchaseDate ?? null,
      return_by: i.returnBy ?? null,
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

const statusSchema = z.enum(["owned", "returned", "sold", "disposed", "cancelled"]);

/** PostgREST reports a function the database doesn't have as PGRST202 (or 42883). */
const missingFunction = (e: { code?: string }) => e.code === "PGRST202" || e.code === "42883";
const NOT_MIGRATED: ActionResult = {
  ok: false,
  message: "Returns aren't set up on your database yet. Run `npx supabase db push`, then try again.",
};

export async function setItemStatus(itemId: string, status: string): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!id.safeParse(itemId).success || !parsed.success) return INVALID;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ status: parsed.data })
    .eq("id", itemId)
    .select("id, order_id");
  if (error) return failed("setItemStatus", error);
  if (!data.length) return NOT_FOUND;
  // Un-cancelling an item, say, changes whether its order is cancelled.
  const orderId = data[0].order_id;
  if (orderId) {
    const { error: statusError } = await supabase.rpc("refresh_order_status", { order_id: orderId });
    if (statusError && !missingFunction(statusError)) return failed("refresh_order_status", statusError);
  }
  refresh();
  return { ok: true };
}

const outcomeSchema = z.object({
  orderId: id,
  /** Empty: the whole order. */
  itemIds: z.array(id).max(200),
  outcome: z.enum(["returned", "cancelled"]),
  refund: money,
});
export type PurchaseOutcome = z.infer<typeof outcomeSchema>;

/** Marks a whole order, or some of its items, returned or cancelled, and adds the money back to the order. */
export async function recordPurchaseOutcome(input: PurchaseOutcome): Promise<ActionResult> {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { orderId, itemIds, outcome, refund } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_purchase_outcome", {
    order_id: orderId,
    item_ids: itemIds,
    outcome,
    refund,
  });
  if (error) return missingFunction(error) ? NOT_MIGRATED : failed("recordPurchaseOutcome", error);
  refresh();
  return { ok: true };
}

/** Sets how much of an order's total came back (0 for none). */
export async function setOrderRefund(orderId: string, amount: number): Promise<ActionResult> {
  if (!id.safeParse(orderId).success || !money.safeParse(amount).success) return INVALID;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_order_refund", { order_id: orderId, amount });
  if (error) return missingFunction(error) ? NOT_MIGRATED : failed("setOrderRefund", error);
  refresh();
  return { ok: true };
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
  refresh();
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
  invoiceRef: optionalText(100),
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

  const taken = await purchaseWithNumbers(supabase, blankToNull(o.orderRef), blankToNull(o.invoiceRef), orderId);
  if (taken) {
    return { ok: false, message: `Another purchase (${taken.merchant}) already has this order or invoice number.` };
  }

  const { error } = await supabase
    .from("orders")
    .update({
      merchant: o.merchant,
      order_date: o.orderDate,
      order_ref: blankToNull(o.orderRef),
      invoice_ref: blankToNull(o.invoiceRef),
      total: o.total ?? null,
      field_meta: {},
    })
    .eq("id", orderId);
  if (error?.code === "23505") {
    return { ok: false, message: "Another purchase already has this order or invoice number." };
  }
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

  const { documentIds } = await purchaseDocumentIds(supabase, orderId);

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return failed("deleteOrder", error);
  if (order.import_id) await supabase.from("imports").delete().eq("id", order.import_id);

  await removeOrphanDocuments(supabase, documentIds);
  refresh();
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
  parts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        cost: money.optional(),
        kind: z.enum(["service", "fee", "part"]).optional(),
      }),
    )
    .max(50),
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
      parts: e.parts.map((p) => ({ name: p.name, cost: p.cost ?? null, kind: p.kind ?? "part" })),
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
  refresh();
  return { ok: true };
}

// ── Documents ───────────────────────────────────────────────────────────

const DOCUMENT_KINDS = ["invoice", "order_confirmation", "warranty_card", "service_receipt", "refund_notice", "other"] as const;

const attachSchema = z
  .object({
    orderId: id.optional(),
    itemId: id.optional(),
    serviceEventId: id.optional(),
    /** Anything that isn't one of the named kinds is filed as "other" (Miscellaneous). */
    kind: z.enum(DOCUMENT_KINDS).default("other"),
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(512),
          fileName: z.string().trim().min(1).max(255),
          mimeType: z.string().min(1).max(127),
          size: z.number().int().nonnegative().max(10 * 1024 * 1024),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((a) => [a.orderId, a.itemId, a.serviceEventId].filter(Boolean).length === 1);

export type AttachInput = z.input<typeof attachSchema>;

/**
 * Attaches files the browser already uploaded to a purchase, item or service
 * event. A file stored before (same SHA-256) is attached as it is, without a
 * second copy.
 */
export async function attachDocuments(input: AttachInput): Promise<ActionResult & { attached?: number }> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { orderId, itemId, serviceEventId, kind, files } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId || files.some((f) => !f.path.startsWith(`${userId}/`))) {
    return { ok: false, message: "Please sign in again." };
  }

  const target = orderId
    ? { order_id: orderId }
    : itemId
      ? { item_id: itemId }
      : { service_event_id: serviceEventId! };
  const [table, targetId] = orderId
    ? (["orders", orderId] as const)
    : itemId
      ? (["items", itemId] as const)
      : (["service_events", serviceEventId!] as const);
  const { data: exists } = await supabase.from(table).select("id").eq("id", targetId).maybeSingle();
  if (!exists) {
    await supabase.storage.from("documents").remove(files.map((f) => f.path));
    return NOT_FOUND;
  }

  let attached = 0;
  for (const f of files) {
    const { data: earlier } = await supabase.from("documents").select("id").eq("sha256", f.sha256).maybeSingle();
    let documentId = earlier?.id;
    if (documentId) {
      await supabase.storage.from("documents").remove([f.path]);
    } else {
      const { data: doc, error } = await supabase
        .from("documents")
        .insert({
          kind,
          file_name: f.fileName,
          storage_path: f.path,
          mime_type: f.mimeType,
          size_bytes: f.size,
          sha256: f.sha256,
          source: "manual",
        })
        .select("id")
        .single();
      if (error || !doc) {
        await supabase.storage.from("documents").remove([f.path]);
        console.error("[records] attaching document failed:", error?.message);
        continue;
      }
      documentId = doc.id;
    }
    const { error: linkError } = await supabase.from("document_links").insert({ document_id: documentId, ...target });
    if (!linkError || linkError.code === "23505") attached++;
  }

  if (attached === 0) return { ok: false, message: "Couldn't attach the files. Please try again." };
  return { ok: true, attached };
}
