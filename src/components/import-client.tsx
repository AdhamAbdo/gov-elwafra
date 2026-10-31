"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileUp, History, Link2, ListChecks } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { useAccess } from "@/components/app-shell";
import { Badge, Field, TableTitle } from "@/components/ui";
import { parseCsv, toCsv } from "@/lib/csv";
import { FIELDS, MAX_IMPORT_ROWS, autoMap, buildRows, licenseKey, summarize, type ExistingKeys, type ImportEntity } from "@/lib/import-rules";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });
const jobSchema = z.object({ id: z.string().uuid(), entity_type: z.string().nullable(), file_name: z.string().nullable(), total_rows: z.number().nullable(), imported_rows: z.number().nullable(), skipped_rows: z.number().nullable(), status: z.string(), created_at: z.string() });
const errorSchema = z.object({ row_number: z.number(), message: z.string(), kind: z.string() });
const resultSchema = z.object({ job_id: z.string().uuid(), imported: z.number(), skipped: z.number() });
const entityText: Record<ImportEntity, string> = { licenses: "التراخيص", employees: "الموظفون" };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export default function ImportClient() {
  const access = useAccess();
  const [companies, setCompanies] = useState<z.infer<typeof companySchema>[]>([]); const [jobs, setJobs] = useState<z.infer<typeof jobSchema>[]>([]);
  const [entity, setEntity] = useState<ImportEntity>("licenses"); const [company, setCompany] = useState("");
  const [fileName, setFileName] = useState(""); const [table, setTable] = useState<string[][] | null>(null); const [map, setMap] = useState<Record<string, number>>({});
  const [existing, setExisting] = useState<ExistingKeys | null>(null); const [confirmed, setConfirmed] = useState(false); const [onlyProblems, setOnlyProblems] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [errorsByJob, setErrorsByJob] = useState<Record<string, z.infer<typeof errorSchema>[]>>({});

  const allowed = useMemo(() => companies.filter((c) => access.managerOf.includes(c.id)), [companies, access.managerOf]);
  const loadJobs = useCallback(async () => {
    const [c, j] = await Promise.all([supabase.from("companies").select("id,name_ar").order("name_ar"), supabase.from("import_jobs").select("id,entity_type,file_name,total_rows,imported_rows,skipped_rows,status,created_at").order("created_at", { ascending: false }).limit(20)]);
    const failure = c.error ?? j.error; if (failure) { setError(`تعذر تحميل البيانات: ${failure.message}`); return; }
    const pc = z.array(companySchema).safeParse(c.data), pj = z.array(jobSchema).safeParse(j.data);
    if (!pc.success || !pj.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); return; }
    setCompanies(pc.data); setJobs(pj.data);
  }, []);
  useEffect(() => { void Promise.resolve().then(loadJobs); }, [loadJobs]);

  const reset = () => { setTable(null); setFileName(""); setExisting(null); setConfirmed(false); setMap({}); };

  async function onFile(file: File | undefined) {
    setError(null); setNotice(null); reset();
    if (!file) return;
    if (!company) { setError("اختر الشركة أولاً."); return; }
    if (!/\.csv$/i.test(file.name)) { setError("الملف يجب أن يكون بصيغة CSV. من Excel: ملف ← حفظ باسم ← CSV UTF-8."); return; }
    if (file.size > MAX_FILE_BYTES) { setError("الملف أكبر من 2 ميغابايت."); return; }
    let parsed: string[][];
    try { parsed = parseCsv(await file.text()); } catch (e) { setError(e instanceof Error ? e.message : "تعذرت قراءة الملف."); return; }
    if (parsed.length < 2) { setError("الملف يجب أن يحتوي صف عناوين وصفاً واحداً من البيانات على الأقل."); return; }
    if (parsed.length - 1 > MAX_IMPORT_ROWS) { setError(`الحد الأقصى ${MAX_IMPORT_ROWS} صف في كل عملية استيراد.`); return; }
    setBusy(true);
    const [br, li, em] = await Promise.all([
      supabase.from("branches").select("name_ar").eq("company_id", company).eq("active", true),
      supabase.from("licenses").select("license_number,expiry_date").eq("company_id", company), supabase.from("employees").select("employee_code"),
    ]);
    setBusy(false);
    const failure = br.error ?? li.error ?? em.error; if (failure) { setError(`تعذر فحص التكرار: ${failure.message}`); return; }
    setExisting({ branches: new Set((br.data ?? []).map((b) => norm(b.name_ar))), licenses: new Set((li.data ?? []).map((l) => licenseKey(l.license_number, l.expiry_date))), employeeCodes: new Set((em.data ?? []).map((e) => norm(e.employee_code))) });
    setFileName(file.name); setTable(parsed); setMap(autoMap(entity, parsed[0]));
  }

  const headers = table?.[0] ?? [];
  const rows = useMemo(() => (table && existing ? buildRows(entity, table.slice(1), map, existing) : []), [table, existing, entity, map]);
  const sum = summarize(rows);
  const missingRequired = FIELDS[entity].filter((f) => f.required && (map[f.key] ?? -1) < 0);
  const shown = rows.filter((r) => !onlyProblems || r.errors.length || r.duplicate).slice(0, 200);

  async function commit() {
    setBusy(true); setError(null);
    const payload = rows.filter((r) => !r.errors.length && !r.duplicate).map((r) => ({ line: r.line, ...r.values }));
    const { data, error: rpcError } = await supabase.rpc(entity === "licenses" ? "import_licenses" : "import_employees", { target_company: company, file_label: fileName, payload });
    setBusy(false);
    if (rpcError) { setError(`تعذر الاستيراد: ${rpcError.message}`); return; }
    const res = resultSchema.safeParse(data); if (!res.success) { setError("استجابة غير متوقعة من الخادم."); return; }
    setNotice(`اكتمل الاستيراد: أُضيف ${res.data.imported} سجل، وتُخطي ${res.data.skipped} (راجع السجل أدناه).`); reset(); void loadJobs();
  }
  async function showErrors(id: string) {
    const { data, error: e } = await supabase.from("import_errors").select("row_number,message,kind").eq("import_job_id", id).order("row_number");
    if (e) { setError(`تعذر تحميل الأخطاء: ${e.message}`); return; }
    const p = z.array(errorSchema).safeParse(data); if (p.success) setErrorsByJob((m) => ({ ...m, [id]: p.data }));
  }
  function downloadTemplate() {
    const cols = FIELDS[entity].map((f) => ({ key: f.key, header: f.label }));
    const sample: Record<string, string> = entity === "licenses" ? { license_type: "رخصة بلدية", authority: "بلدي", license_number: "LIC-0001", issue_date: "2026-01-01", expiry_date: "2027-01-01", branch: "", notes: "" } : { employee_code: "EMP-0001", full_name: "الاسم", job_title: "", start_date: "2026-01-01", branch: "" };
    const url = URL.createObjectURL(new Blob([toCsv([sample], cols)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${entity}-template.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  if (access.userId && access.managerOf.length === 0) return <div className="p-8"><p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">الاستيراد متاح لمديري الشركات والإدارة العامة ومسؤولي النظام فقط.</p></div>;

  return (
    <div className="p-5 md:p-8">
      <div data-tour="page-title" className="mb-6"><p className="text-sm text-slate-500">الرئيسية / استيراد البيانات</p><h1 className="text-2xl font-bold">استيراد البيانات</h1></div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <div className="toolbar" data-tour="toolbar">
        <Field label="نوع البيانات"><select value={entity} onChange={(e) => { setEntity(e.target.value as ImportEntity); reset(); }}>{(Object.keys(entityText) as ImportEntity[]).map((k) => <option key={k} value={k}>{entityText[k]}</option>)}</select></Field>
        <Field label="الشركة"><select value={company} onChange={(e) => { setCompany(e.target.value); reset(); }}><option value="">اختر</option>{allowed.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">ملف CSV (حتى {MAX_IMPORT_ROWS} صف)</span><input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <span className="toolbar-spacer" /><button type="button" data-tour="template" onClick={downloadTemplate} className="btn-secondary"><Download size={17} aria-hidden="true" />تنزيل القالب</button>
      </div>
      <p data-tour="import-note" className="mb-5 text-xs text-slate-500">لاستيراد ملف Excel: احفظه من Excel بصيغة «CSV UTF-8». لا يُستبدل أي سجل موجود؛ المكرر يُتخطى ويُسجَّل. تُراجَع الصفوف في المعاينة أولاً ولا يُحفظ شيء قبل تأكيدك.</p>

      {table && existing && (
        <>
          <article className="mb-5">
            <TableTitle icon={Link2} tone="blue" title={`ربط الأعمدة — ${fileName}`} subtitle="اربط أعمدة الملف بحقول النظام" count={headers.length} unit="عمود" />
            <div className="grid gap-3 p-5 md:grid-cols-3">{FIELDS[entity].map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}><select value={map[f.key] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}><option value={-1}>— غير مرتبط —</option>{headers.map((h, i) => <option key={i} value={i}>{h || `(عمود ${i + 1})`}</option>)}</select></Field>))}</div>
            {missingRequired.length > 0 && <p role="alert" className="border-t border-red-100 bg-red-50 p-3 text-sm text-red-800">اربط الأعمدة المطلوبة: {missingRequired.map((f) => f.label).join("، ")}</p>}
          </article>

          <article className="mb-5">
            <TableTitle icon={ListChecks} tone="green" title="معاينة قبل الاستيراد" subtitle="لا يُحفظ شيء قبل تأكيدك">
              <span className="flex flex-wrap items-center gap-2"><Badge tone="gray">{`${sum.total} صف`}</Badge><Badge tone="green">{`${sum.importable} صالح`}</Badge><Badge tone="amber">{`${sum.duplicates} مكرر`}</Badge><Badge tone="red">{`${sum.invalid} غير صالح`}</Badge></span></TableTitle>
            <label className="flex items-center gap-2 border-b px-5 py-3 text-sm"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />عرض الصفوف ذات المشاكل فقط</label>
            <div className="max-h-[420px] overflow-auto"><table className="min-w-[700px] text-right text-sm">
              <thead><tr><th>السطر</th>{FIELDS[entity].map((f) => <th key={f.key}>{f.label}</th>)}<th>الحالة</th></tr></thead>
              <tbody>{shown.map((r) => <tr key={r.line}><td>{r.line}</td>{FIELDS[entity].map((f) => <td key={f.key}>{r.values[f.key] || "—"}</td>)}<td>{r.errors.length ? <Badge tone="red">{r.errors.join("؛ ")}</Badge> : r.duplicate ? <Badge tone="amber">{r.duplicate}</Badge> : <Badge tone="green">جاهز</Badge>}</td></tr>)}
                {shown.length === 0 && <tr><td colSpan={FIELDS[entity].length + 2} className="text-center text-slate-500">لا توجد صفوف للعرض.</td></tr>}</tbody></table></div>
            {rows.length > shown.length && !onlyProblems && <p className="border-t p-3 text-xs text-slate-500">تُعرض أول 200 صف فقط؛ يشمل الاستيراد كل الصفوف الصالحة.</p>}
          </article>

          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_42_42/0.05),0_4px_14px_rgb(15_42_42/0.06)]">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />أؤكد استيراد {sum.importable} سجل جديد إلى «{companies.find((c) => c.id === company)?.name_ar}». أفهم أن الصفوف المكررة وغير الصالحة ستُتخطى وأن السجلات الموجودة لن تُعدَّل.</label>
            <button type="button" disabled={busy || !confirmed || sum.importable === 0 || missingRequired.length > 0} onClick={() => void commit()} className="btn-primary mt-3"><FileUp size={17} aria-hidden="true" />{busy ? "جارٍ الاستيراد…" : `تأكيد الاستيراد (${sum.importable})`}</button>
            {sum.importable === 0 && <p className="mt-2 text-xs text-slate-500">لا توجد صفوف صالحة للاستيراد.</p>}
          </div>
        </>
      )}

      <article data-tour="import-history" className="mt-8">
        <TableTitle icon={History} tone="amber" title="سجل عمليات الاستيراد" subtitle="عمليات الاستيراد السابقة وما أُضيف وما تُخطي" count={jobs.length} unit="عملية" />
        <div className="overflow-x-auto"><table className="min-w-[700px] text-right text-sm">
          <thead><tr>{["التاريخ", "النوع", "الملف", "الصفوف", "أُضيف", "تُخطي", "التفاصيل"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {jobs.length === 0 && <tr><td colSpan={7} className="text-center text-slate-500">لا توجد عمليات استيراد بعد.</td></tr>}
            {jobs.map((j) => <tr key={j.id}><td dir="ltr">{new Date(j.created_at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}</td><td>{entityText[j.entity_type as ImportEntity] ?? j.entity_type ?? "—"}</td><td dir="ltr">{j.file_name ?? "—"}</td><td>{j.total_rows ?? "—"}</td><td>{j.imported_rows ?? "—"}</td><td>{j.skipped_rows ?? "—"}</td>
              <td>{(j.skipped_rows ?? 0) > 0 ? (errorsByJob[j.id] ? <ul className="text-xs">{errorsByJob[j.id].map((e, i) => <li key={i}>سطر {e.row_number}: {e.message}</li>)}</ul> : <button type="button" onClick={() => void showErrors(j.id)} className="rounded-lg border px-3 py-1 text-xs">عرض الصفوف المتخطاة</button>) : "—"}</td></tr>)}
          </tbody></table></div>
      </article>
    </div>
  );
}
