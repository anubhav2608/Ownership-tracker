import "server-only";
import { cache } from "react";
import * as demo from "./mock-data";
import type { Database } from "./supabase/database.types";
import { isSupabaseConfigured } from "./supabase/env";
import { createClient } from "./supabase/server";
import type {
  Category,
  ExtractedLine,
  FieldState,
  ImportError,
  ImportRecord,
  Item,
  Order,
  Part,
  ServiceEvent,
  StoredDocument,
  Tracked,
} from "./types";

// The app's data access. Signed-in users get their own rows from Supabase (row
// level security scopes every query to them); without Supabase settings the
// app runs as a demo on the sample data in mock-data.ts.

type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "in.example.com";

const categories: Record<Database["public"]["Enums"]["item_category"], Category> = {
  electronics: "Electronics",
  appliances: "Appliances",
  vehicle: "Vehicle",
  furniture: "Furniture",
  clothing: "Clothing",
  accessories: "Accessories",
  home: "Home",
  toys: "Toys",
  other: "Miscellaneous",
};

const db = cache(createClient);

async function query<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data as T;
}

const dateOnly = (timestamp: string) => timestamp.slice(0, 10);

type FieldMeta = Record<string, { state: FieldState; confidence?: number }>;

function tracked(value: number | null, meta: FieldMeta, key: string): Tracked<number> {
  const m = meta[key];
  if (value === null) return { value: null, state: "missing" };
  return { value: Number(value), state: m?.state ?? "confirmed", confidence: m?.confidence };
}

// ── User ────────────────────────────────────────────────────────────────

export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured) return demo.getCurrentUser();

  const supabase = await db();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) throw new Error("Not signed in");

  const [profile, senders, held] = await Promise.all([
    query<Row<"profiles"> | null>(supabase.from("profiles").select("*").eq("id", claims.sub).maybeSingle()),
    query<Row<"verified_senders">[]>(supabase.from("verified_senders").select("*").order("created_at")),
    query<Pick<Row<"imports">, "id" | "extracted" | "created_at">[]>(
      supabase
        .from("imports")
        .select("id, extracted, created_at")
        .eq("source", "email")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(20),
    ),
  ]);
  // Gmail's latest "confirm forwarding" email from the last week, if it's still there.
  const confirmation = held.find(
    (i) => (i.extracted as { forwarding?: unknown } | null)?.forwarding && Date.parse(i.created_at) > Date.now() - 7 * 864e5,
  );

  const email = typeof claims.email === "string" ? claims.email : "";
  return {
    id: claims.sub,
    name: profile?.display_name || email.split("@")[0] || "there",
    email,
    forwardingAddress: profile ? `${profile.forwarding_token}@${INBOUND_DOMAIN}` : "",
    /** Whether mail sent to forwarding addresses reaches this app (Resend receiving is set up). */
    forwardingReady: Boolean(process.env.INBOUND_EMAIL_DOMAIN && process.env.RESEND_WEBHOOK_SECRET),
    /** Gmail's request to confirm forwarding to this account, shown in Settings. */
    forwardingConfirmation: confirmation
      ? {
          importId: confirmation.id,
          receivedAt: confirmation.created_at,
          ...(confirmation.extracted as unknown as { forwarding: { gmail: string; code: string; link: string | null } })
            .forwarding,
        }
      : null,
    verifiedSenders: senders.filter((s) => s.verified_at).map((s) => s.email),
    pendingSenders: senders.filter((s) => !s.verified_at).map((s) => s.email),
    /** The personal key for the Gmail script; only its hint is ever shown again. */
    gmailKey:
      profile?.inbound_key_hash && profile.inbound_key_created_at
        ? { hint: profile.inbound_key_hint ?? "", createdAt: profile.inbound_key_created_at }
        : null,
  };
});

// ── Documents ───────────────────────────────────────────────────────────

function toDocument(d: Row<"documents">): StoredDocument {
  return {
    id: d.id,
    kind: d.kind,
    fileName: d.file_name,
    sizeKb: Math.ceil(d.size_bytes / 1024),
    source: d.source,
    addedAt: dateOnly(d.created_at),
  };
}

export async function getDocuments(ids?: string[]): Promise<StoredDocument[]> {
  if (!isSupabaseConfigured) return demo.getDocuments(ids);
  if (ids && ids.length === 0) return [];
  const supabase = await db();
  let q = supabase.from("documents").select("*").order("created_at", { ascending: false });
  if (ids) q = q.in("id", ids);
  return (await query<Row<"documents">[]>(q)).map(toDocument);
}

export async function getImportDocuments(importId: string): Promise<StoredDocument[]> {
  if (!isSupabaseConfigured) return demo.getImportDocuments();
  const supabase = await db();
  const rows = await query<Row<"documents">[]>(
    supabase.from("documents").select("*").eq("import_id", importId).order("created_at"),
  );
  return rows.map(toDocument);
}

const getDocumentLinks = cache(async () => {
  const supabase = await db();
  return query<Row<"document_links">[]>(supabase.from("document_links").select("*"));
});

// ── Orders ──────────────────────────────────────────────────────────────

async function toOrders(rows: Row<"orders">[]): Promise<Order[]> {
  const links = await getDocumentLinks();
  return rows.map((o) => ({
    id: o.id,
    merchant: o.merchant,
    orderRef: o.order_ref ?? undefined,
    invoiceRef: o.invoice_ref ?? undefined,
    orderDate: o.order_date ?? dateOnly(o.created_at),
    total: o.total === null ? 0 : Number(o.total),
    status: o.status,
    refundedAmount: o.refunded_amount === null ? undefined : Number(o.refunded_amount),
    source: o.source,
    importId: o.import_id ?? undefined,
    documentIds: links.filter((l) => l.order_id === o.id).map((l) => l.document_id),
  }));
}

export async function getOrders(): Promise<Order[]> {
  if (!isSupabaseConfigured) return demo.getOrders();
  const supabase = await db();
  return toOrders(await query<Row<"orders">[]>(supabase.from("orders").select("*")));
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (!isSupabaseConfigured) return demo.getOrder(id);
  const supabase = await db();
  const row = await query<Row<"orders"> | null>(
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
  );
  return row ? (await toOrders([row]))[0] : undefined;
}

// ── Items ───────────────────────────────────────────────────────────────

async function toItems(rows: Row<"items">[]): Promise<Item[]> {
  if (rows.length === 0) return [];
  const supabase = await db();
  const [warranties, links] = await Promise.all([
    query<Row<"warranties">[]>(
      supabase.from("warranties").select("*").in("item_id", rows.map((r) => r.id)),
    ),
    getDocumentLinks(),
  ]);

  return rows.map((r) => {
    const meta = r.field_meta as FieldMeta;
    const w = warranties.find((x) => x.item_id === r.id);
    return {
      id: r.id,
      name: r.name,
      brand: r.brand ?? undefined,
      model: r.model ?? undefined,
      category: categories[r.category],
      status: r.status,
      orderId: r.order_id ?? undefined,
      purchaseDate: r.purchase_date ?? dateOnly(r.created_at),
      returnBy: r.return_by ?? undefined,
      price: tracked(r.price, meta, "price"),
      identifiers: r.identifiers as unknown as Item["identifiers"],
      warranty: w && {
        months: w.months,
        startsOn: w.starts_on,
        expiresOn: w.expires_on,
        provider: w.provider ?? "",
        state: w.state === "missing" ? "confirmed" : w.state,
        evidence: w.evidence ?? undefined,
        documentId: w.document_id ?? undefined,
      },
      documentIds: links.filter((l) => l.item_id === r.id).map((l) => l.document_id),
      notes: r.notes ?? undefined,
    };
  });
}

export async function getItems(): Promise<Item[]> {
  if (!isSupabaseConfigured) return demo.getItems();
  const supabase = await db();
  return toItems(
    await query<Row<"items">[]>(
      supabase.from("items").select("*").order("purchase_date", { ascending: false }),
    ),
  );
}

export async function getItem(id: string): Promise<Item | undefined> {
  if (!isSupabaseConfigured) return demo.getItem(id);
  const supabase = await db();
  const row = await query<Row<"items"> | null>(
    supabase.from("items").select("*").eq("id", id).maybeSingle(),
  );
  return row ? (await toItems([row]))[0] : undefined;
}

// ── Service events ──────────────────────────────────────────────────────

export async function getServiceEvents(itemId?: string): Promise<ServiceEvent[]> {
  if (!isSupabaseConfigured) return demo.getServiceEvents(itemId);
  const supabase = await db();
  let q = supabase.from("service_events").select("*");
  if (itemId) q = q.eq("item_id", itemId);
  const events = await query<Row<"service_events">[]>(q);
  if (events.length === 0) return [];

  const parts = await query<Row<"service_event_parts">[]>(
    supabase
      .from("service_event_parts")
      .select("*")
      .in("service_event_id", events.map((e) => e.id))
      .order("position"),
  );

  return events.map((e) => ({
    id: e.id,
    itemId: e.item_id ?? undefined,
    date: e.service_date,
    provider: e.provider ?? "",
    workPerformed: e.work_performed,
    parts: parts
      .filter((p) => p.service_event_id === e.id)
      .map((p) => ({
        name: p.name,
        cost: p.cost === null ? undefined : Number(p.cost),
        kind: (p.kind ?? "part") as Part["kind"],
      })),
    labourCost: e.labour_cost === null ? undefined : Number(e.labour_cost),
    totalCost: Number(e.total_cost),
    odometerKm: e.odometer_km ?? undefined,
    documentId: e.document_id ?? undefined,
    importId: e.import_id ?? undefined,
    notes: e.notes ?? undefined,
  }));
}

// ── Imports ─────────────────────────────────────────────────────────────

interface StoredExtraction {
  fields?: ImportRecord["fields"];
  lines?: ExtractedLine[];
  parts?: ExtractedLine[];
  text?: string[];
  /** A refund notice: the purchase it was matched to. */
  refund?: { order_id: string; item_ids: string[]; matched_on: "order_number" | "earlier_email" } | null;
}

interface StoredCandidate {
  item_id: string;
  score: number;
  evidence: string[];
}

interface StoredResult {
  order_id?: string;
  item_ids?: string[];
  service_event_id?: string;
  /** Money back from a refund notice applied to order_id. */
  refund?: number;
  refunded_item_ids?: string[];
}

function toImport(r: Row<"imports">): ImportRecord {
  const extracted = r.extracted as StoredExtraction;
  const result = r.result as StoredResult | null;
  return {
    id: r.id,
    source: r.source === "email" ? "email" : "upload",
    receivedAt: r.received_at,
    title: r.title,
    from: r.from_email ?? undefined,
    status: r.status,
    stage: r.stage,
    attempts: r.attempts,
    documentKind: r.document_kind ?? undefined,
    parser: r.parser ?? undefined,
    reviewReasons: r.review_reasons.length ? r.review_reasons : undefined,
    error: (r.error as ImportError | null) ?? undefined,
    duplicateOfId: r.duplicate_of ?? undefined,
    fields: extracted.fields,
    lines: extracted.lines,
    parts: extracted.parts,
    text: extracted.text,
    refundMatch: extracted.refund
      ? { orderId: extracted.refund.order_id, itemIds: extracted.refund.item_ids, matchedOn: extracted.refund.matched_on }
      : undefined,
    candidates: (r.candidates as unknown as StoredCandidate[]).map((c) => ({
      itemId: c.item_id,
      score: c.score,
      evidence: c.evidence,
    })),
    result: result
      ? {
          orderId: result.order_id,
          itemIds: result.item_ids,
          serviceEventId: result.service_event_id,
          refund: result.refund,
          refundedItemIds: result.refunded_item_ids,
        }
      : undefined,
  };
}

export const getImports = cache(async (): Promise<ImportRecord[]> => {
  if (!isSupabaseConfigured) return demo.getImports();
  const supabase = await db();
  const rows = await query<Row<"imports">[]>(
    supabase.from("imports").select("*").order("received_at", { ascending: false }),
  );
  return rows.map(toImport);
});

export async function getImport(id: string): Promise<ImportRecord | undefined> {
  if (!isSupabaseConfigured) return demo.getImport(id);
  const supabase = await db();
  const row = await query<Row<"imports"> | null>(
    supabase.from("imports").select("*").eq("id", id).maybeSingle(),
  );
  return row ? toImport(row) : undefined;
}
