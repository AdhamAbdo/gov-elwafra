"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { useAccess } from "@/components/app-shell";
import { Field, LoadingBlock } from "@/components/ui";
import { notificationHref } from "@/lib/notifications";

const rowSchema = z.object({ id: z.string().uuid(), event_type: z.string(), title: z.string(), body: z.string().nullable(), entity_type: z.string().nullable(), read_at: z.string().nullable(), scheduled_at: z.string() });
const settingSchema = z.object({ key: z.string(), int_values: z.array(z.number()) });
type Row = z.infer<typeof rowSchema>;
const settingText: Record<string, string> = { license_thresholds_days: "تنبيهات التراخيص (أيام قبل الانتهاء)", contract_thresholds_days: "تنبيهات العقود (أيام قبل الانتهاء)", action_due_days: "تنبيه الإجراءات التصحيحية (أيام قبل الاستحقاق)" };
const eventText: Record<string, string> = { license_expiry: "ترخيص", contract_expiry: "عقد", critical_deadline: "موعد حرج", weekly_task_due: "فحص أسبوعي", overdue_inspection: "فحص متأخر", new_resignation: "استقالة / إنهاء خدمة", review_returned: "مراجعة معادة", finding_escalated: "نتيجة مصعّدة", action_due_soon: "إجراء تصحيحي", action_overdue: "إجراء متأخر" };

export default function NotificationsClient() {
  const access = useAccess();
  const [rows, setRows] = useState<Row[]>([]); const [settings, setSettings] = useState<z.infer<typeof settingSchema>[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [n, s] = await Promise.all([
      supabase.from("notifications").select("id,event_type,title,body,entity_type,read_at,scheduled_at").eq("in_app", true).lte("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: false }).limit(200),
      supabase.from("notification_settings").select("key,int_values").order("key"),
    ]);
    const failure = n.error ?? s.error;
    if (failure) { setError(`تعذر تحميل الإشعارات: ${failure.message}`); setLoading(false); return; }
    const pn = z.array(rowSchema).safeParse(n.data), ps = z.array(settingSchema).safeParse(s.data);
    if (!pn.success || !ps.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    setRows(pn.data); setSettings(ps.data); setLoading(false);
    window.dispatchEvent(new Event("notifications-changed"));
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function markRead(id: string) { const { error: e } = await supabase.rpc("mark_notification_read", { notification_id: id }); if (e) setError(`تعذر التحديث: ${e.message}`); else void load(); }
  async function markAll() { const { error: e } = await supabase.rpc("mark_all_notifications_read"); if (e) setError(`تعذر التحديث: ${e.message}`); else { setNotice("تم تعليم جميع الإشعارات كمقروءة."); void load(); } }
  const visible = rows.filter((r) => !unreadOnly || !r.read_at); const unread = rows.filter((r) => !r.read_at).length;
  const isAdmin = access.adminOf.length > 0;

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 flex justify-between gap-3">
        <div data-tour="page-title"><p className="text-sm text-slate-500">الرئيسية / الإشعارات</p><h1 className="text-2xl font-bold">الإشعارات</h1></div>
        <div className="flex items-start gap-3"><button onClick={() => void load()} aria-label="تحديث"><RefreshCw className={loading ? "animate-spin" : ""} size={19} /></button>{unread > 0 && <button data-tour="mark-all" onClick={() => void markAll()} className="border px-3 py-1.5 text-sm">تعليم الكل كمقروء</button>}</div>
      </div>
      {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {unread > 0 && <label data-tour="unread-filter" className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />غير المقروءة فقط ({unread})</label>}
      <article data-tour="notification-list" className="mb-8 border bg-white">
        {loading && rows.length === 0 && <LoadingBlock />}
        {!loading && visible.length === 0 && <p className="p-6 text-center text-slate-500">{rows.length === 0 ? "لا توجد إشعارات." : "لا توجد إشعارات غير مقروءة."}</p>}
        <ul className="divide-y">{visible.map((r) => (
          <li key={r.id} className={`flex items-start justify-between gap-3 p-4 ${r.read_at ? "" : "bg-emerald-50/40"}`}>
            <div><p className={r.read_at ? "" : "font-bold"}><span className="ml-2 bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">{eventText[r.event_type] ?? r.event_type}</span>{r.title}</p>{r.body && <p className="mt-1 text-sm text-slate-600">{r.body}</p>}<p className="mt-1 text-xs text-slate-400" dir="ltr">{new Date(r.scheduled_at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}</p></div>
            <div className="flex shrink-0 gap-2"><Link href={notificationHref(r.entity_type)} className="border px-2 py-1 text-xs">فتح</Link>{!r.read_at && <button onClick={() => void markRead(r.id)} className="border px-2 py-1 text-xs">مقروء</button>}</div>
          </li>))}</ul>
      </article>
      <Thresholds settings={settings} editable={isAdmin} fail={setError} done={() => { setNotice("تم حفظ الحدود."); void load(); }} />
    </div>
  );
}

function Thresholds({ settings, editable, fail, done }: { settings: z.infer<typeof settingSchema>[]; editable: boolean; fail(v: string): void; done(): void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  async function save(e: FormEvent<HTMLFormElement>, key: string) {
    e.preventDefault(); const values = (draft[key] ?? "").split(/[,\s،]+/).filter(Boolean).map(Number);
    if (values.length === 0 || values.some((v) => !Number.isInteger(v) || v < 1 || v > 365)) { fail("أدخل أعداد أيام صحيحة بين 1 و365 مفصولة بفواصل."); return; }
    const { error } = await supabase.rpc("set_notification_thresholds", { setting_key: key, vals: values });
    if (error) { fail(`تعذر حفظ الحدود: ${error.message}`); return; }
    done();
  }
  return (
    <article data-tour="thresholds" className="border bg-white p-5">
      <h2 className="mb-1 font-bold">حدود التنبيه</h2><p className="mb-4 text-xs text-slate-500">تطبق على الإشعارات الجديدة عند التشغيل القادم للمهمة. عقد يتبقى على انتهائه أقل من 24 ساعة يُنبَّه إليه كموعد حرج دائماً.</p>
      <div className="grid gap-4 md:grid-cols-3">{settings.map((s) => (
        <form key={s.key} onSubmit={(e) => void save(e, s.key)}>
          <Field label={settingText[s.key] ?? s.key}><input dir="ltr" disabled={!editable} value={draft[s.key] ?? s.int_values.join(", ")} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))} /></Field>
          {editable && <button className="mt-2 border px-3 py-1 text-xs">حفظ</button>}
        </form>))}</div>
      {!editable && <p className="mt-3 text-xs text-slate-500">التعديل متاح لمسؤول النظام فقط.</p>}
    </article>
  );
}
