"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Paperclip, Trash2, Upload, X } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { Field, IconButton, LoadingBlock } from "@/components/ui";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/lib/file-validation";

export type AttachmentEntity = "license" | "contract" | "employee_event" | "platform_verification" | "compliance_check" | "corrective_action";
const rowSchema = z.object({ id: z.string().uuid(), file_name: z.string(), size_bytes: z.number().nullable(), uploaded_by: z.string().uuid().nullable(), created_at: z.string() });
type Row = z.infer<typeof rowSchema>;
const kb = (n: number | null) => (n === null ? "—" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function authedPost(path: string, body: BodyInit, json: boolean): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "انتهت الجلسة، سجّل الدخول مجدداً." };
  const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, ...(json ? { "Content-Type": "application/json" } : {}) }, body }).catch(() => null);
  if (!res) return { ok: false, error: "تعذر الاتصال بالخادم." };
  const data: unknown = await res.json().catch(() => null);
  return res.ok ? { ok: true, data } : { ok: false, error: (data as { error?: string } | null)?.error ?? `فشل الطلب (${res.status}).` };
}

/** Paperclip action that opens a dialog listing a record's files with upload / download / remove. The server enforces every permission. */
export function AttachmentsButton({ entityType, entityId, title }: { entityType: AttachmentEntity; entityId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <IconButton icon={Paperclip} label="المرفقات" onClick={() => setOpen(true)} />
    {open && <AttachmentsDialog entityType={entityType} entityId={entityId} title={title} close={() => setOpen(false)} />}
  </>;
}

function AttachmentsDialog({ entityType, entityId, title, close }: { entityType: AttachmentEntity; entityId: string; title: string; close(): void }) {
  const [rows, setRows] = useState<Row[]>([]); const [people, setPeople] = useState<Map<string, string>>(new Map()); const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null); const [reason, setReason] = useState(""); const fileRef = useRef<HTMLInputElement>(null); const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, p] = await Promise.all([supabase.from("attachments").select("id,file_name,size_bytes,uploaded_by,created_at").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false }), supabase.from("user_profiles").select("id,display_name")]);
    if (a.error) { setError(`تعذر تحميل المرفقات: ${a.error.message}`); setLoading(false); return; }
    const pa = z.array(rowSchema).safeParse(a.data); if (!pa.success) { setError("تم استلام بنية بيانات غير متوقعة."); setLoading(false); return; }
    setRows(pa.data); setPeople(new Map((p.data ?? []).map((x: { id: string; display_name: string }) => [x.id, x.display_name]))); setLoading(false);
  }, [entityType, entityId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { dialogRef.current?.focus(); const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [close]);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setNotice(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("اختر ملفاً أولاً."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError("حجم الملف يتجاوز 10 ميغابايت."); return; }
    setBusy(true);
    const form = new FormData(); form.set("entityType", entityType); form.set("entityId", entityId); form.set("file", file);
    const r = await authedPost("/api/attachments/upload", form, false); setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    if (fileRef.current) fileRef.current.value = ""; setNotice("تم رفع الملف."); void load();
  }
  async function download(id: string) {
    setError(null);
    const r = await authedPost("/api/attachments/url", JSON.stringify({ id }), true);
    const url = r.ok ? (r.data as { url?: string }).url : null;
    if (!r.ok || !url) { setError(r.ok ? "استجابة غير متوقعة." : r.error); return; }
    const a = document.createElement("a"); a.href = url; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  }
  async function remove(id: string) {
    if (!reason.trim()) { setError("سبب الإزالة مطلوب."); return; }
    const { error: e } = await supabase.rpc("remove_attachment", { att_id: id, reason });
    if (e) { setError(`تعذرت الإزالة: ${e.message}`); return; }
    setRemoving(null); setReason(""); setNotice("أُزيل المرفق من القائمة (يُحتفظ بالملف في الأرشيف)."); void load();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`مرفقات ${title}`} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 text-right shadow-2xl outline-none" dir="rtl">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-bold">المرفقات</h2><p className="text-sm text-slate-500">{title}</p></div><button type="button" onClick={close} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button></div>
        {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        <ul className="mb-4 divide-y rounded-xl border">
          {loading && <li><LoadingBlock compact /></li>}
          {!loading && rows.length === 0 && <li className="p-4 text-center text-sm text-slate-500">لا توجد مرفقات لهذا السجل.</li>}
          {rows.map((r) => (
            <li key={r.id} className="p-3">
              <div className="flex items-center gap-3"><FileText size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" dir="auto">{r.file_name}</p><p className="text-xs text-slate-500">{kb(r.size_bytes)} · {r.uploaded_by ? people.get(r.uploaded_by) ?? "—" : "—"} · <span dir="ltr">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}</span></p></div>
                <IconButton icon={Download} tone="blue" label="تنزيل" onClick={() => void download(r.id)} /><IconButton icon={Trash2} tone="red" label="إزالة" onClick={() => { setRemoving(removing === r.id ? null : r.id); setReason(""); }} />
              </div>
              {removing === r.id && <div className="mt-3 flex flex-wrap items-end gap-2"><div className="min-w-[200px] flex-1"><Field label="سبب الإزالة (مطلوب)"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div><button type="button" onClick={() => void remove(r.id)} className="min-h-[42px] rounded-lg bg-red-700 px-4 text-sm text-white">تأكيد الإزالة</button></div>}
            </li>))}
        </ul>
        <form onSubmit={upload} className="rounded-xl bg-slate-50 p-4">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">رفع ملف جديد</span><input ref={fileRef} type="file" accept={ALLOWED_EXTENSIONS.map((x) => `.${x}`).join(",")} className="w-full" /></label>
          <p className="mt-2 text-xs text-slate-500">المسموح: {ALLOWED_EXTENSIONS.join("، ")} — حتى 10 ميغابايت. يُفحص محتوى الملف الفعلي على الخادم، ولا تُعرض الملفات داخل المتصفح بل تُنزَّل فقط.</p>
          <button disabled={busy} className="btn-primary mt-3"><Upload size={17} aria-hidden="true" />{busy ? "جارٍ الرفع…" : "رفع"}</button>
        </form>
      </div>
    </div>
  );
}
