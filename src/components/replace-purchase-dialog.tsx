"use client";

import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import type { ExistingPurchase } from "@/lib/purchases";

/**
 * Asked when a purchase with the same order or invoice number already exists.
 * Replacing deletes the old purchase (with its items and their history) and
 * saves the new one in its place.
 */
export function ReplacePurchaseDialog({
  existing,
  onCancel,
  onReplace,
}: {
  existing: ExistingPurchase | null;
  onCancel: () => void;
  onReplace: (existing: ExistingPurchase) => void;
}) {
  const number = existing?.matchedOn === "invoice" ? existing.invoiceRef : existing?.orderRef;
  return (
    <AlertDialog open={existing !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This purchase already exists</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                You already have a purchase with {existing?.matchedOn ?? "order"} number{" "}
                <span className="font-mono text-foreground">{number}</span>:
              </p>
              {existing && (
                <p className="rounded-lg border bg-muted/50 px-3 py-2 text-foreground">
                  <Link href={`/purchases/${existing.id}`} target="_blank" className="font-medium hover:underline">
                    {existing.merchant}
                  </Link>
                  {existing.orderDate && <> · {formatDate(existing.orderDate)}</>}
                  {existing.total !== null && <> · {formatMoney(existing.total)}</>}
                  {" · "}
                  {existing.itemCount} item{existing.itemCount === 1 ? "" : "s"}
                </p>
              )}
              <p>
                Do you want to override it? The existing purchase and its items are replaced by this one
                {existing?.serviceCount
                  ? `, and their ${existing.serviceCount === 1 ? "1 service record is" : `${existing.serviceCount} service records are`} deleted too`
                  : ""}
                .
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, keep the existing one</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => existing && onReplace(existing)}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Yes, override it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
