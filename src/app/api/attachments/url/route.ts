import { z } from "zod";
import { requireUser, respond } from "@/lib/server-auth";

// The database function both authorizes the caller and writes the access to the audit log; only then is a 60-second link signed.
// The link forces a download (Content-Disposition: attachment), so uploaded content is never rendered by the browser inline.
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respond(400, { error: "طلب غير صالح." });
  const info = await ctx.userClient.rpc("get_attachment_for_download", { att_id: parsed.data.id });
  const row = Array.isArray(info.data) ? info.data[0] : null;
  if (info.error || !row) return respond(403, { error: info.error?.message ?? "غير مصرح." });
  const signed = await ctx.service.storage.from("attachments").createSignedUrl(row.storage_path as string, 60, { download: row.file_name as string });
  if (signed.error || !signed.data) return respond(500, { error: `تعذر إنشاء رابط التنزيل: ${signed.error?.message ?? ""}` });
  return respond(200, { url: signed.data.signedUrl });
}
