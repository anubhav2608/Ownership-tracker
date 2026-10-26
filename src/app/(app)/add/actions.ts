"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  purchaseDocumentIds,
  purchaseWithNumbers,
  removeOrphanDocuments,
  type ExistingPurchase,
} from "@/lib/purchases";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, categoryValue } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024;

const uploadSchema = z.object({
  path: z.string().min(1).max(512),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  size: z.number().int().nonnegative().max(MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type RegisterUploadResult =
  | { ok: true; importId: string }
  | { ok: false; reason: "duplicate"; importId?: string }
  | { ok: false; reason: "invalid" | "failed"; message: string };

/**
 * Records a file the browser already uploaded to the private "documents" bucket
 * as a document and a queued import. A file uploaded before (same SHA-256) is
 * reported as a duplicate and the new copy is removed.
 */
export async function registerUpload(input: z.input<typeof uploadSchema>): Promise<RegisterUploadResult> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", message: "That file can't be imported." };
  const { path, fileName, mimeType, size, sha256 } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId || !path.startsWith(`${userId}/`)) {
    return { ok: false, reason: "invalid", message: "Please sign in again." };
  }

  const removeUpload = () => supabase.storage.from("documents").remove([path]);

  const { data: existing } = await supabase
    .from("documents")
    .select("import_id")
    .eq("sha256", sha256)
    .maybeSingle();
  if (existing) {
    await removeUpload();
    return { ok: false, reason: "duplicate", importId: existing.import_id ?? undefined };
  }

  const { data: imp, error: importError } = await supabase
    .from("imports")
    .insert({ source: "upload", title: fileName, content_sha256: sha256 })
    .select("id")
    .single();
  if (importError || !imp) {
    await removeUpload();
    if (importError?.code === "23505") {
      const { data: earlier } = await supabase
        .from("imports")
        .select("id")
        .eq("content_sha256", sha256)
        .is("duplicate_of", null)
        .maybeSingle();
      return { ok: false, reason: "duplicate", importId: earlier?.id };
    }
    console.error("[upload] creating import failed:", importError?.message);
    return { ok: false, reason: "failed", message: "Couldn't save the upload. Please try again." };
  }

  const { error: documentError } = await supabase.from("documents").insert({
    kind: "other",
    file_name: fileName,
    storage_path: path,
    mime_type: mimeType,
    size_bytes: size,
    sha256,
    source: "upload",
    import_id: imp.id,
  });
  if (documentError) {
    await Promise.all([removeUpload(), supabase.from("imports").delete().eq("id", imp.id)]);
    console.error("[upload] creating document failed:", documentError.message);
    return { ok: false, reason: "failed", message: "Couldn't save the upload. Please try again." };
  }

  return { ok: true, importId: imp.id };
}

// ── Manual entry ────────────────────────────────────────────────────────


const money = z.number().nonnegative().max(1e10);
const isoDate = z.iso.date();

/** Where values came from: fields left out were entered or confirmed by the user. */
const fieldMeta = z
  .record(
    z.string(),
    z.object({ state: z.enum(["missing", "extracted", "confirmed"]), confidence: z.number().min(0).max(1).optional() }),
  )
  .optional();

const purchaseSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
  orderDate: isoDate,
  orderRef: z.string().trim().max(100).optional(),
  invoiceRef: z.string().trim().max(100).optional(),
  importId: z.uuid().optional(),
  /** The existing purchase with the same order or invoice number, which the user agreed to replace. */
  replaceOrderId: z.uuid().optional(),
  /** Defaults to the sum of item prices; differs when there's shipping or a discount. */
  total: money.optional(),
  fieldMeta,
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        category: z.enum(CATEGORIES),
        price: money.optional(),
        /** Last day it can be returned. */
        returnBy: isoDate.optional(),
        fieldMeta,
        /** Only when a document states one; "extracted" warranties need the quoted evidence. */
        warranty: z
          .object({
            months: z.number().int().min(1).max(240),
            state: z.enum(["extracted", "confirmed"]),
            evidence: z.string().trim().max(500).optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type PurchaseInput = z.input<typeof purchaseSchema>;

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; message: string; existing?: ExistingPurchase };

function saveFailed(where: string, error: { message: string; code?: string }): SaveResult {
  console.error(`[manual] ${where} failed:`, error.code, error.message);
  return {
    ok: false,
    message:
      error.code === "P0002"
        ? "That import was already saved or no longer exists."
        : "Couldn't save. Please check the details and try again.",
  };
}

/** Saves a purchase and its items in one transaction; attaches the import's documents if given. */
export async function createPurchase(input: PurchaseInput): Promise<SaveResult> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please fill in the merchant, date and item names." };
  const p = parsed.data;

  const supabase = await createClient();
  // Files of the purchase being replaced, to clean up once it's gone.
  const replaced = p.replaceOrderId ? await purchaseDocumentIds(supabase, p.replaceOrderId) : null;

  const { data, error } = await supabase.rpc("create_manual_purchase", {
    purchase: {
      merchant: p.merchant,
      order_date: p.orderDate,
      order_ref: p.orderRef || null,
      invoice_ref: p.invoiceRef || null,
      replace_order_id: p.replaceOrderId ?? null,
      import_id: p.importId ?? null,
      total: p.total ?? null,
      field_meta: p.fieldMeta ?? {},
      items: p.items.map((i) => ({
        name: i.name,
        category: categoryValue(i.category),
        price: i.price ?? null,
        return_by: i.returnBy ?? null,
        field_meta: i.fieldMeta ?? {},
        warranty: i.warranty ?? null,
      })),
    },
  });
  if (error?.code === "OT409") {
    const existing = await purchaseWithNumbers(supabase, p.orderRef, p.invoiceRef);
    if (existing) {
      return { ok: false, message: "A purchase with this order or invoice number already exists.", existing };
    }
  }
  if (error) return saveFailed("create_manual_purchase", error);
  if (replaced) await removeOrphanDocuments(supabase, replaced.documentIds);
  // Saving an import takes it off the "needs you" count in the menu.
  if (p.importId) refresh();
  return { ok: true, id: (data as { order_id: string }).order_id };
}

const serviceSchema = z.object({
  itemId: z.uuid(),
  serviceDate: isoDate,
  workPerformed: z.string().trim().min(1).max(500),
  provider: z.string().trim().max(200).optional(),
  totalCost: money,
  labourCost: money.optional(),
  odometerKm: z.number().int().nonnegative().max(10_000_000).optional(),
  notes: z.string().trim().max(2000).optional(),
  parts: z.array(z.object({ name: z.string().trim().min(1).max(200), cost: money.optional() })).max(50),
  importId: z.uuid().optional(),
});

export type ServiceEventInput = z.input<typeof serviceSchema>;

/** Saves a service event (and its replaced parts) on one of the user's items. */
export async function createServiceEvent(input: ServiceEventInput): Promise<SaveResult> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please fill in the item, date, work and cost." };
  const e = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_manual_service_event", {
    event: {
      item_id: e.itemId,
      service_date: e.serviceDate,
      work_performed: e.workPerformed,
      provider: e.provider ?? null,
      total_cost: e.totalCost,
      labour_cost: e.labourCost ?? null,
      odometer_km: e.odometerKm ?? null,
      notes: e.notes ?? null,
      import_id: e.importId ?? null,
      parts: e.parts.map((part) => ({ name: part.name, cost: part.cost ?? null })),
    },
  });
  if (error) return saveFailed("create_manual_service_event", error);
  if (e.importId) refresh();
  return { ok: true, id: (data as { service_event_id: string }).service_event_id };
}
