import { connection } from "next/server";
import { sampleInvoiceEml } from "@/lib/demo/sample-data";

/** A fictional service invoice (an email file) for demo visitors with none of their own to upload. */
export async function GET() {
  await connection();
  return new Response(sampleInvoiceEml(), {
    headers: {
      "content-type": "message/rfc822",
      "content-disposition": 'attachment; filename="Service invoice from Example Motors.eml"',
      "cache-control": "no-store",
    },
  });
}
