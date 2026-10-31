import { SectionCard } from "@/components/layout-bits";
import { getExtractionFeedback } from "@/lib/data";
import { summarizeFeedback } from "@/lib/evals/feedback";

const FIELD_LABELS: Record<string, string> = {
  merchant: "Shop",
  provider: "Provider",
  orderRef: "Order number",
  date: "Date",
  total: "Total",
  workPerformed: "Work performed",
  outcome: "Returned or cancelled",
  item: "Items missed or not real",
  "item.name": "Item name",
  "item.price": "Item price",
  "refund.purchase": "Purchase for a refund",
  "refund.items": "Items that went back",
};

const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

/** How often what was read had to be corrected before saving, from the user's own saves. */
export async function ReadingAccuracy() {
  const rows = await getExtractionFeedback();
  const s = summarizeFeedback(rows);
  return (
    <SectionCard title="How well emails are read">
      <div className="space-y-4 p-5 text-sm">
        {s.imports === 0 ? (
          <p className="text-muted-foreground">
            After you save a few imports, this shows how often you had to correct what was read, and where.
          </p>
        ) : (
          <>
            <p>
              <span className="text-2xl font-semibold tabular-nums">{pct(s.untouched, s.imports)}</span>{" "}
              <span className="text-muted-foreground">
                of {s.imports} import{s.imports === 1 ? "" : "s"} saved without changing anything
              </span>
            </p>
            {s.fields.length > 0 && (
              <table className="w-full text-left">
                <caption className="mb-2 text-left text-xs text-muted-foreground">Most often corrected</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-normal">What</th>
                    <th className="py-1 font-normal">Shop</th>
                    <th className="py-1 text-right font-normal">Corrected</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {s.fields.slice(0, 8).map((f) => (
                    <tr key={`${f.shop}|${f.field}`}>
                      <td className="py-1.5">{FIELD_LABELS[f.field] ?? f.field}</td>
                      <td className="py-1.5 text-muted-foreground">{f.shop}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {f.changed} of {f.compared} ({pct(f.changed, f.compared)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}
