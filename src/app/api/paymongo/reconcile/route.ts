import { z } from "zod";
import { readFile } from "node:fs/promises";
import { bearerMatches, checkoutSchema, configuration, databaseClient, failure, loadCheckout, PaymentError, readBody, reconcile, respond, rpc, paymentRPC } from "@/lib/paymongo/test-payments";
export const maxDuration = 60;
const input = z.union([
  z.object({ after: z.uuid().nullable().optional() }).strict(),
  z.object({ checkoutId: z.uuid(), sessionId: z.string().regex(/^cs_[A-Za-z0-9]+$/).optional() }).strict(),
]);
export async function POST(request: Request) {
  try {
    const config = configuration();
    if (!bearerMatches(request.headers.get("authorization"), config.cron)) throw new PaymentError(401, "Unauthorized");
    const parsed = input.safeParse(JSON.parse((await readBody(request, 2048)).toString("utf8")));
    if (!parsed.success) throw new PaymentError(400, "Invalid reconciliation request");
    const db = databaseClient();
    if ("checkoutId" in parsed.data) {
      const c = await loadCheckout(db, parsed.data.checkoutId);
      return respond(await reconcile(db, c, parsed.data.sessionId));
    }
    const batch = z.array(checkoutSchema).parse(await rpc(db, paymentRPC("list_paymongo_test_checkouts"), { p_after: parsed.data.after ?? null }));
    // Prior database-only simulations have deliberately fake provider IDs.
    // This local TEST-only exclusion list is captured before real TEST sessions
    // are created; it never applies to LIVE or alters stored financial records.
    let excluded: string[] = [];
    if (!config.live && process.env.KJM_PAYMONGO_TEST === "true") {
      try { excluded = z.array(z.uuid()).parse(JSON.parse(await readFile(`${process.cwd()}/.paymongo-tools/excluded-synthetic-checkouts.json`, "utf8"))); } catch { /* reconcile all if no valid local list */ }
    }
    // Five independent checkouts; one failure does not stop the cursor.
    const results = await Promise.all(batch.map(async c => {
      if (excluded.includes(c.id)) return { checkoutId: c.id, status: "database_simulation" };
      try { return await reconcile(db, c); }
      catch { return { checkoutId: c.id, status: "retry_required" }; }
    }));
    return respond({ results, nextCursor: batch.length === 5 ? batch[batch.length - 1].id : null });
  } catch (error) { return failure(error); }
}
