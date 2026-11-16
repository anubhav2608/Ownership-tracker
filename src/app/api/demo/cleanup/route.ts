import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Deletes demo accounts (anonymous users) older than a few days, with their
// files. Run daily by Vercel Cron (vercel.json); Vercel sends the CRON_SECRET
// as a bearer token, so only it can call this.

export const maxDuration = 60;
const KEEP_DAYS = 3;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  if (!isSupabaseConfigured) return Response.json({ deleted: 0 });

  const db = createAdminClient();
  const before = Date.now() - KEEP_DAYS * 864e5;
  let deleted = 0;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("[demo cleanup] listing users failed:", error.message);
      return Response.json({ error: "Couldn't list users." }, { status: 500 });
    }
    const stale = data.users.filter((u) => u.is_anonymous && Date.parse(u.created_at) < before);
    for (const user of stale) {
      // Their files first: the database rows go with the account, the stored files don't.
      const { data: files } = await db.storage.from("documents").list(user.id, { limit: 1000 });
      if (files?.length) await db.storage.from("documents").remove(files.map((f) => `${user.id}/${f.name}`));
      const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
      if (deleteError) console.error("[demo cleanup] deleting a demo user failed:", deleteError.message);
      else deleted++;
    }
    if (data.users.length < 200) break;
  }
  return Response.json({ deleted });
}
