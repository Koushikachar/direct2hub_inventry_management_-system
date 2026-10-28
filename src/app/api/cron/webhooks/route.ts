import { bearerOk } from "@/lib/cronauth";
import { processDue } from "@/lib/webhooks";
/** Retry worker. Call it on a schedule with  Authorization: Bearer $CRON_SECRET  (Vercel Cron adds this header automatically when CRON_SECRET is set). */
async function run(req: Request) {
  if (!bearerOk(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json({ processed: await processDue(50) });
}
export const GET = run, POST = run;
