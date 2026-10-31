"use client";

import { AttachmentsButton } from "@/components/attachments";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Info, Landmark, RefreshCw } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { useAccess } from "@/components/app-shell";
import { Field, TableTitle, SkeletonRows } from "@/components/ui";
import ScrollToForm from "@/components/scroll-to-form";
import { PLATFORMS, daysSinceVerification, verificationErrors, type Platform } from "@/lib/verifications";

const rowSchema = z.object({
  id: z.string().uuid(), platform: z.string(), company_id: z.string().uuid(), branch_id: z.string().uuid().nullable(), employee_id: z.string().uuid().nullable(),
  wage_period: z.string().nullable(), verified_at: z.string(), verified_by: z.string().uuid(), next_deadline: z.string().nullable(), outcome: z.string(),
  observed_status: z.string(), notes: z.string().nullable(), evidence_reference: z.string().nullable(), follow_up_action: z.string().nullable(), follow_up_due: z.string().nullable(),
  follow_up_closed_at: z.string().nullable(), nitaqat_classification: z.string().nullable(), nitaqat_total_employees: z.number().nullable(), nitaqat_saudi_employees: z.number().nullable(),
});
type Row = z.infer<typeof rowSchema>;
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });
const branchSchema = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name_ar: z.string() });
const employeeSchema = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), full_name: z.string() });
const profileSchema = z.object({ id: z.string().uuid(), display_name: z.string() });
type Company = z.infer<typeof companySchema>; type Branch = z.infer<typeof branchSchema>; type Employee = z.infer<typeof employeeSchema>;

const platformText: Record<Platform, string> = { qiwa: "قوى", gosi: "التأمينات الاجتماعية", mudad: "مدد", nitaqat: "نطاقات", balady: "بلدي", sfda: "الغذاء والدواء", civil_defense: "الدفاع المدني" };
const outcomeText: Record<string, string> = { no_issue: "لا توجد مشكلة", issue_found: "توجد مشكلة", unable_to_verify: "تعذر التحقق" };
const outcomeClass: Record<string, string> = { no_issue: "bg-emerald-50 text-emerald-800", issue_found: "bg-red-100 text-red-800", unable_to_verify: "bg-amber-100 text-amber-800" };
const stamp = (t: string | null) => (t ? new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "—");
const dateOnly = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—");
const riyadhNowInput = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 16);

export default function VerificationsClient() {
  const access = useAccess();
  const [rows, setRows] = useState<Row[]>([]); const [companies, setCompanies] = useState<Company[]>([]); const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]); const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState(""); const [companyFilter, setCompanyFilter] = useState(""); const [outcomeFilter, setOutcomeFilter] = useState(""); const [openOnly, setOpenOnly] = useState(false);
  const [creating, setCreating] = useState(false); const [closing, setClosing] = useState<Row | null>(null); const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [v, c, b, e, p] = await Promise.all([
      supabase.from("platform_verifications").select("id,platform,company_id,branch_id,employee_id,wage_period,verified_at,verified_by,next_deadline,outcome,observed_status,notes,evidence_reference,follow_up_action,follow_up_due,follow_up_closed_at,nitaqat_classification,nitaqat_total_employees,nitaqat_saudi_employees").order("verified_at", { ascending: false }).limit(500),
      supabase.from("companies").select("id,name_ar").order("name_ar"), supabase.from("branches").select("id,company_id,name_ar").order("name_ar"),
      supabase.from("employees").select("id,company_id,full_name").order("full_name"), supabase.from("user_profiles").select("id,display_name"),
    ]);
    const failure = v.error ?? c.error ?? b.error ?? e.error ?? p.error;
    if (failure) { setError(`تعذر تحميل سجلات التحقق: ${failure.message}`); setLoading(false); return; }
    const pv = z.array(rowSchema).safeParse(v.data), pc = z.array(companySchema).safeParse(c.data), pb = z.array(branchSchema).safeParse(b.data), pe = z.array(employeeSchema).safeParse(e.data), pp = z.array(profileSchema).safeParse(p.data);
    if (!pv.success || !pc.success || !pb.success || !pe.success || !pp.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    setRows(pv.data); setCompanies(pc.data); setBranches(pb.data); setEmployees(pe.data); setPeople(new Map(pp.data.map((x) => [x.id, x.display_name]))); setNow(new Date()); setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const name = useMemo(() => new Map([...companies.map((x) => [x.id, x.name_ar] as const), ...branches.map((x) => [x.id, x.name_ar] as const), ...employees.map((x) => [x.id, x.full_name] as const)]), [companies, branches, employees]);
  const latest = useMemo(() => { const m = new Map<string, Row>(); for (const r of rows) { const k = `${r.company_id}:${r.platform}`; if (!m.has(k)) m.set(k, r); } return m; }, [rows]);
  const isOpenFollowUp = (r: Row) => !!r.follow_up_action && !r.follow_up_closed_at;
  const openCount = rows.filter(isOpenFollowUp).length;
  const overdueFollowUps = rows.filter((r) => isOpenFollowUp(r) && r.follow_up_due && daysSinceVerification(`${r.follow_up_due}T00:00:00+03:00`, now)! > 0).length;
  const visible = rows.filter((r) => (!platformFilter || r.platform === platformFilter) && (!companyFilter || r.company_id === companyFilter) && (!outcomeFilter || r.outcome === outcomeFilter) && (!openOnly || isOpenFollowUp(r)));
  const done = (message: string) => { setCreating(false); setClosing(null); setNotice(message); void load(); };
  const mayRecord = access.officerOf.length > 0;

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 flex justify-between gap-3">
        <div data-tour="page-title"><p className="text-sm text-slate-500">الرئيسية / المنصات الحكومية</p><h1 className="text-2xl font-bold">متابعة المنصات الحكومية</h1></div>
        <div className="flex items-start gap-3">
          <button onClick={() => void load()} aria-label="تحديث"><RefreshCw className={loading ? "animate-spin" : ""} size={19} /></button>
          {mayRecord && <button data-tour="add-verification" onClick={() => setCreating(!creating)} className="bg-[#0c4b45] px-4 py-2 text-sm text-white">تسجيل تحقق</button>}
        </div>
      </div>
      <p data-tour="manual-note" className="mb-5 flex items-start gap-3 rounded-xl bg-[#e6f1ef] p-4 text-sm leading-relaxed text-[#0c4b45]"><Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />جميع السجلات هنا نتيجة تحقق يدوي يجريه موظف على المنصة الرسمية؛ لا يوجد ربط آلي مع أي منصة حكومية. السجلات غير قابلة للتعديل، ويُصحَّح الخطأ بتسجيل تحقق جديد.</p>
      {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {creating && <ScrollToForm dep={true}><RecordForm companies={companies.filter((c) => access.officerOf.includes(c.id))} branches={branches} employees={employees} fail={setError} done={done} close={() => setCreating(false)} /></ScrollToForm>}
      {closing && <ScrollToForm dep={closing}><CloseForm row={closing} fail={setError} done={done} close={() => setClosing(null)} /></ScrollToForm>}

      <article data-tour="platform-matrix" className="mb-6 overflow-hidden border bg-white">
        <TableTitle icon={Landmark} tone="blue" title="آخر تحقق لكل منصة" subtitle="«لم يتم التحقق» تعني عدم وجود أي سجل، وليست حالة امتثال" />
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm">
          <thead className="bg-slate-50"><tr><th className="px-3 py-3">الشركة</th>{PLATFORMS.map((p) => <th key={p} className="px-3 py-3">{platformText[p]}</th>)}</tr></thead>
          <tbody>
            {!loading && companies.length === 0 && <tr><td colSpan={PLATFORMS.length + 1} className="p-6 text-center text-slate-500">لا توجد شركات ضمن صلاحياتك.</td></tr>}
            {companies.map((c) => <tr key={c.id} className="border-t"><td className="px-3 py-3 font-medium">{c.name_ar}</td>{PLATFORMS.map((p) => { const r = latest.get(`${c.id}:${p}`); const age = r ? daysSinceVerification(r.verified_at, now) : null; return <td key={p} className="px-3 py-3">{r ? <><span className={`inline-block px-2 py-0.5 text-xs ${outcomeClass[r.outcome]}`}>{outcomeText[r.outcome]}</span><small className="block text-slate-500">قبل {age} يوماً</small></> : <span className="text-xs text-slate-400">لم يتم التحقق</span>}</td>; })}</tr>)}
          </tbody></table></div>
      </article>

      <div data-tour="filters" className="toolbar filter-grid">
        <Field label="المنصة"><select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}><option value="">الكل</option>{PLATFORMS.map((p) => <option key={p} value={p}>{platformText[p]}</option>)}</select></Field>
        <Field label="الشركة"><select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}><option value="">الكل</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="النتيجة"><select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}><option value="">الكل</option>{Object.entries(outcomeText).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />متابعات مفتوحة فقط</label>
        <div className="rounded-xl bg-gradient-to-br from-[#103b38] to-[#0f766e] px-4 py-2.5 text-sm text-white">متابعات مفتوحة: <b>{openCount}</b>{overdueFollowUps > 0 && <span className="text-[#fca5a5]"> ({overdueFollowUps} متأخرة)</span>}</div>
      </div>

      <article data-tour="verification-table" className="overflow-hidden border bg-white">
        <TableTitle icon={ClipboardList} tone="green" title="سجل التحقق" subtitle="التحقق اليدوي من المنصات الرسمية ونتائجه" count={`${visible.length} من ${rows.length}`} />
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-right text-sm">
          <thead className="bg-slate-50"><tr>{["المنصة", "النطاق", "تاريخ التحقق", "فترة الأجور", "الموعد التشغيلي التالي", "النتيجة", "الحالة الظاهرة", "المتابعة"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={8} />}
            {!loading && visible.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">{rows.length === 0 ? "لا توجد سجلات تحقق بعد. سجّل أول تحقق يدوي من زر «تسجيل تحقق»." : "لا توجد نتائج مطابقة للتصفية."}</td></tr>}
            {visible.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-3">{platformText[r.platform as Platform] ?? r.platform}</td>
                <td className="px-3 py-3">{name.get(r.company_id) ?? "—"}<small className="block text-slate-500">{r.branch_id ? name.get(r.branch_id) : "على مستوى الشركة"}{r.employee_id ? ` · ${name.get(r.employee_id) ?? "موظف"}` : ""}</small></td>
                <td className="px-3 py-3" dir="ltr">{stamp(r.verified_at)}<small className="block text-slate-500">{people.get(r.verified_by) ?? ""}</small></td>
                <td className="px-3 py-3" dir="ltr">{r.wage_period ?? "—"}</td><td className="px-3 py-3" dir="ltr">{dateOnly(r.next_deadline)}</td>
                <td className="px-3 py-3"><span className={`inline-block px-2 py-0.5 text-xs ${outcomeClass[r.outcome]}`}>{outcomeText[r.outcome]}</span></td>
                <td className="px-3 py-3">{r.observed_status}{r.nitaqat_classification && <small className="block text-slate-600">التصنيف الرسمي: {r.nitaqat_classification} ({r.nitaqat_saudi_employees} سعودي من {r.nitaqat_total_employees})</small>}{r.notes && <small className="block text-slate-500">{r.notes}</small>}{r.evidence_reference && <small className="block text-slate-500">الدليل: {r.evidence_reference}</small>}</td>
                <td className="px-3 py-3"><div className="mb-2"><AttachmentsButton entityType="platform_verification" entityId={r.id} title={`${platformText[r.platform as Platform] ?? r.platform} — ${name.get(r.company_id) ?? ""}`} /></div>{r.follow_up_action ? <>{r.follow_up_action}<small className="block text-slate-500">{r.follow_up_closed_at ? `أُغلقت ${stamp(r.follow_up_closed_at)}` : `الاستحقاق: ${dateOnly(r.follow_up_due)}`}</small>{isOpenFollowUp(r) && mayRecord && access.officerOf.includes(r.company_id) && <button onClick={() => setClosing(r)} className="mt-1 border px-2 py-1 text-xs">إغلاق المتابعة</button>}</> : "—"}</td>
              </tr>))}
          </tbody></table></div>
      </article>
    </div>
  );
}

function RecordForm({ companies, branches, employees, fail, done, close }: { companies: Company[]; branches: Branch[]; employees: Employee[]; fail(v: string): void; done(m: string): void; close(): void }) {
  const [v, setV] = useState<Record<string, string>>({ platform: "gosi", outcome: "no_issue", checkedAt: riyadhNowInput() }); const [errors, setErrors] = useState<Record<string, string>>({});
  const g = (k: string) => v[k] ?? ""; const set = (k: string) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const err = (k: string) => errors[k] && <small role="alert" className="block text-red-700">{errors[k]}</small>;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problems = verificationErrors({ platform: g("platform"), companyId: g("company"), outcome: g("outcome"), observedStatus: g("observed"), wagePeriod: g("period"), notes: g("notes"), followUpAction: g("followUp"), nitaqatClass: g("nClass"), nitaqatTotal: g("nTotal"), nitaqatSaudi: g("nSaudi") });
    if (!g("checkedAt")) problems.checkedAt = "وقت التحقق مطلوب";
    setErrors(problems); if (Object.keys(problems).length) return;
    const nit = g("platform") === "nitaqat";
    const { error } = await supabase.rpc("record_platform_verification", {
      platform_name: g("platform"), target_company: g("company"), target_branch: g("branch") || null, target_employee: g("employee") || null, period: g("period") || null,
      checked_at: new Date(`${g("checkedAt")}:00+03:00`).toISOString(), deadline: g("deadline") || null, result: g("outcome"), observed: g("observed"), note_text: g("notes") || null,
      evidence: g("evidence") || null, follow_up: g("followUp") || null, follow_up_by: g("followUpDue") || null,
      nitaqat_class: nit ? g("nClass") || null : null, nitaqat_total: nit && g("nTotal") ? Number(g("nTotal")) : null, nitaqat_saudi: nit && g("nSaudi") ? Number(g("nSaudi")) : null,
    });
    if (error) { fail(`تعذر تسجيل التحقق: ${error.message}`); return; }
    done("تم تسجيل التحقق اليدوي.");
  }
  return (
    <form onSubmit={submit} noValidate className="mb-5 border bg-white p-5">
      <button type="button" onClick={close} className="float-left">إلغاء</button><h2 className="mb-3 font-bold">تسجيل تحقق يدوي من منصة رسمية</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="المنصة"><select value={g("platform")} onChange={set("platform")}>{PLATFORMS.map((p) => <option key={p} value={p}>{platformText[p]}</option>)}</select></Field>
        <Field label="الشركة"><select value={g("company")} onChange={(e) => setV((p) => ({ ...p, company: e.target.value, branch: "", employee: "" }))}><option value="">اختر</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="القسم"><select value={g("branch")} onChange={set("branch")}><option value="">على مستوى الشركة</option>{branches.filter((b) => b.company_id === g("company")).map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}</select></Field>
        {err("companyId")}
        <Field label="موظف (اختياري)"><select value={g("employee")} onChange={set("employee")}><option value="">—</option>{employees.filter((x) => x.company_id === g("company")).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></Field>
        <Field label="وقت التحقق (توقيت الرياض)"><input type="datetime-local" max={riyadhNowInput()} value={g("checkedAt")} onChange={set("checkedAt")} />{err("checkedAt")}</Field>
        <Field label="النتيجة"><select value={g("outcome")} onChange={set("outcome")}>{Object.entries(outcomeText).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
        <div className="md:col-span-2"><Field label="الحالة كما تظهر في المنصة"><input value={g("observed")} onChange={set("observed")} />{err("observedStatus")}</Field></div>
        <Field label="الموعد التشغيلي التالي (اختياري)"><input type="date" value={g("deadline")} onChange={set("deadline")} /></Field>
        {g("platform") === "mudad" && <Field label="فترة الأجور (YYYY-MM)"><input dir="ltr" placeholder="2026-09" value={g("period")} onChange={set("period")} />{err("wagePeriod")}</Field>}
        {g("platform") === "nitaqat" && <>
          <Field label="التصنيف الرسمي الظاهر في المنصة"><input value={g("nClass")} onChange={set("nClass")} />{err("nitaqatClass")}</Field>
          <Field label="إجمالي العاملين (كما في المنصة)"><input inputMode="numeric" dir="ltr" value={g("nTotal")} onChange={set("nTotal")} />{err("nitaqatTotal")}</Field>
          <Field label="عدد السعوديين (كما في المنصة)"><input inputMode="numeric" dir="ltr" value={g("nSaudi")} onChange={set("nSaudi")} />{err("nitaqatSaudi")}</Field>
        </>}
        <div className="md:col-span-2"><Field label={g("outcome") === "issue_found" ? "ملاحظات (مطلوبة)" : "ملاحظات"}><input value={g("notes")} onChange={set("notes")} />{err("notes")}</Field></div>
        <Field label="مرجع الدليل (اختياري)"><input value={g("evidence")} onChange={set("evidence")} /></Field>
        <div className="md:col-span-2"><Field label={g("outcome") === "issue_found" ? "إجراء المتابعة (مطلوب)" : "إجراء المتابعة (اختياري)"}><input value={g("followUp")} onChange={set("followUp")} />{err("followUpAction")}</Field></div>
        <Field label="استحقاق المتابعة"><input type="date" value={g("followUpDue")} onChange={set("followUpDue")} /></Field>
      </div>
      {g("platform") === "nitaqat" && <p className="mt-3 text-xs text-slate-500">سجّل التصنيف والأرقام كما تظهر في منصة نطاقات الرسمية فقط؛ لا يحتسب النظام تصنيفاً تقديرياً.</p>}
      <button className="mt-4 bg-[#0c4b45] px-4 py-2 text-white">حفظ</button>
    </form>
  );
}

function CloseForm({ row, fail, done, close }: { row: Row; fail(v: string): void; done(m: string): void; close(): void }) {
  const [note, setNote] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!note.trim()) { fail("ملاحظة الإغلاق مطلوبة."); return; }
    const { error } = await supabase.rpc("close_verification_follow_up", { verification_id: row.id, closing_note: note });
    if (error) { fail(`تعذر إغلاق المتابعة: ${error.message}`); return; }
    done("تم إغلاق المتابعة.");
  }
  return <form onSubmit={submit} className="mb-5 border border-slate-300 bg-white p-5"><button type="button" onClick={close} className="float-left">إلغاء</button><h2 className="mb-3 font-bold">إغلاق المتابعة: {row.follow_up_action}</h2><Field label="ملاحظة الإغلاق (مطلوبة)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field><p className="mt-2 text-xs text-slate-500">إغلاق المتابعة لا يغيّر نتيجة التحقق الأصلية؛ للتأكد من حل المشكلة سجّل تحققاً جديداً.</p><button className="mt-3 bg-[#163433] px-4 py-2 text-white">إغلاق</button></form>;
}
