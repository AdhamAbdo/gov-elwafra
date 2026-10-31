import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser, respond } from "@/lib/server-auth";
import { MAX_UPLOAD_BYTES, validateUpload } from "@/lib/file-validation";

const targetSchema = z.object({
  entityType: z.enum(["license", "contract", "employee_event", "platform_verification", "compliance_check", "corrective_action"]),
  entityId: z.string().uuid(),
});

// Order matters: authorize (database) -> validate the real bytes -> store -> register metadata -> undo storage if registration fails.
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return respond(413, { error: "حجم الملف يتجاوز 10 ميغابايت." });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const target = targetSchema.safeParse({ entityType: form?.get("entityType"), entityId: form?.get("entityId") });
  if (!form || !(file instanceof File) || !target.success) return respond(400, { error: "طلب غير صالح." });

  const { entityType, entityId } = target.data;
  const authorized = await ctx.userClient.rpc("attachment_upload_check", { et: entityType, eid: entityId });
  if (authorized.error || typeof authorized.data !== "string") return respond(403, { error: authorized.error?.message ?? "غير مصرح." });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateUpload({ name: file.name, size: file.size, bytes });
  if (!checked.ok) return respond(422, { error: checked.error });

  const attachmentId = randomUUID();
  // The storage path never contains the user-supplied name: only ids and the validated extension.
  const path = `${authorized.data}/${entityType}/${entityId}/${attachmentId}.${checked.extension}`;
  const stored = await ctx.service.storage.from("attachments").upload(path, bytes, { contentType: checked.mime, upsert: false });
  if (stored.error) return respond(500, { error: `تعذر حفظ الملف: ${stored.error.message}` });

  const registered = await ctx.userClient.rpc("register_attachment", { att_id: attachmentId, et: entityType, eid: entityId, path, fname: checked.safeName, mime: checked.mime, size: bytes.length, hash: createHash("sha256").update(bytes).digest("hex") });
  if (registered.error) {
    await ctx.service.storage.from("attachments").remove([path]);
    return respond(403, { error: registered.error.message });
  }
  return respond(200, { id: attachmentId, fileName: checked.safeName });
}
