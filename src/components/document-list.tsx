import { Download, FileText } from "lucide-react";
import { documentKindLabel, SourceLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { StoredDocument } from "@/lib/types";

/** Documents live in a private bucket; download goes through a signed URL later. */
export function DocumentList({ documents }: { documents: StoredDocument[] }) {
  if (documents.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted-foreground">No documents attached.</p>;
  }
  return (
    <ul className="divide-y">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-5 py-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{d.fileName}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{documentKindLabel[d.kind]}</span>
              <span>·</span>
              <SourceLabel source={d.source} />
              <span>·</span>
              <span>{formatDate(d.addedAt)}</span>
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label={`Download ${d.fileName}`}>
            <Download />
          </Button>
        </li>
      ))}
    </ul>
  );
}
