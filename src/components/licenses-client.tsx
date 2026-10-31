"use client";

import { AttachmentsButton } from "@/components/attachments";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FileBadge, Hourglass, Plus, RefreshCw, Repeat2, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { useAccess } from "@/components/app-shell";
import { ExportButton } from "@/components/export-button";
import { toCsv } from "@/lib/csv";
import { Badge, Field, IconButton, SearchBox, TableTitle, Toolbar, type Tone, SkeletonRows } from "@/components/ui";
import ScrollToForm from "@/components/scroll-to-form";
import { daysUntilExpiry, effectiveLicenseState, type LicenseState } from "@/lib/licenses";

const licenseSchema = z.object({
  id: z.string().uuid(), company_id: z.string().uuid(), branch_id: z.string().uuid().nullable(),
  license_type: z.string(), authority: z.string(), license_number: z.string(),
  issue_date: z.string().nullable(), expiry_date: z.string(), verified_status: z.string(), last_verified_at: z.string().nullable(),
  renewal_of: z.string().uuid().nullable(), renewal_status: z.string(), next_action: z.string().nullable(), notes: z.string().nullable(),
  companies: z.object({ name_ar: z.string() }).nullable(), branches: z.object({ name_ar: z.string() }).nullable(),
});
type License = z.infer<typeof licenseSchema>;
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });
const branchSchema = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name_ar: z.string() });
type Company = z.infer<typeof companySchema>; type Branch = z.infer<typeof branchSchema>;

type Shown = LicenseState | "superseded";
const stateText: Record<Shown, string> = { expired: "منتهية", within_7: "خلال 7 أيام", within_30: "خلال 30 يوماً", within_60: "خلال 60 يوماً", within_90: "خلال 90 يوماً", ok: "سارية", superseded: "مجدَّدة (سجل تاريخي)" };
const stateTone: Record<Shown, Tone> = { expired: "red", within_7: "red", within_30: "amber", within_60: "amber", within_90: "blue", ok: "green", superseded: "gray" };
const verifiedTone: Record<string, Tone> = { not_verified: "gray", verified_valid: "green", verified_invalid: "red" };
const renewalTone: Record<string, Tone> = { none: "gray", in_progress: "blue", renewed: "green" };
const verifiedText: Record<string, string> = { not_verified: "لم يتم التحقق", verified_valid: "تم التحقق: سارية", verified_invalid: "تم التحقق: غير صالحة" };
const renewalText: Record<string, string> = { none: "—", in_progress: "التجديد جارٍ", renewed: "تم التجديد" };
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—");
const fmtStamp = (t: string | null) => (t ? new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "—");

type Panel = { kind: "verify" | "renew" | "progress"; license: License } | null;

export default function LicensesClient() {
  const access = useAccess();
  const [licenses, setLicenses] = useState<License[]>([]); const [companies, setCompanies] = useState<Company[]>([]); const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [companyFilter, setCompanyFilter] = useState(""); const [stateFilter, setStateFilter] = useState("");
  const [creating, setCreating] = useState(false); const [panel, setPanel] = useState<Panel>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [l, c, b] = await Promise.all([
      supabase.from("licenses").select("id,company_id,branch_id,license_type,authority,license_number,issue_date,expiry_date,verified_status,last_verified_at,renewal_of,renewal_status,next_action,notes,companies(name_ar),branches(name_ar)").order("expiry_date", { ascending: true }),
      supabase.from("companies").select("id,name_ar").order("name_ar"), supabase.from("branches").select("id,company_id,name_ar").order("name_ar"),
    ]);
    const failure = l.error ?? c.error ?? b.error;
    if (failure) { setError(`تعذر تحميل التراخيص: ${failure.message}`); setLoading(false); return; }
    const pl = z.array(licenseSchema).safeParse(l.data), pc = z.array(companySchema).safeParse(c.data), pb = z.array(branchSchema).safeParse(b.data);
    if (!pl.success || !pc.success || !pb.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    setLicenses(pl.data); setCompanies(pc.data); setBranches(pb.data); setNow(new Date()); setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const rows = useMemo(() => licenses.map((license) => ({ license, state: effectiveLicenseState(license.renewal_status, license.expiry_date, now), days: daysUntilExpiry(license.expiry_date, now) })), [licenses, now]);
  const visible = rows.filter(({ license, state }) => (!companyFilter || license.company_id === companyFilter) && (!stateFilter || state === stateFilter) && (!search || [license.license_type, license.license_number, license.authority].some((v) => v.toLowerCase().includes(search.toLowerCase()))));
  const attention = rows.filter((r) => r.state === "expired" || r.state === "within_7" || r.state === "within_30").length;
  const done = (message: string) => { setCreating(false); setPanel(null); setNotice(message); void load(); };

  return (
    <div className="p-5 md:p-8">
      <div data-tour="page-title" className="mb-6"><p className="text-sm text-slate-500">الرئيسية / التراخيص</p><h1 className="text-2xl font-bold">إدارة التراخيص</h1></div>
      <Toolbar actions={<>
        <IconButton icon={RefreshCw} label="تحديث" onClick={() => void load()} />
        <ExportButton label="تصدير CSV" filename="licenses" kind="licenses" companyId={companyFilter || null} build={() => {
          const data = visible.map(({ license: l, state, days }) => ({ type: l.license_type, number: l.license_number, authority: l.authority, company: l.companies?.name_ar ?? "", branch: l.branches?.name_ar ?? "", issue: l.issue_date ?? "", expiry: l.expiry_date, state: stateText[state], days: state === "superseded" ? "" : days, verified: verifiedText[l.verified_status] ?? l.verified_status, lastVerified: l.last_verified_at ?? "", renewal: renewalText[l.renewal_status] ?? l.renewal_status, nextAction: l.next_action ?? "" }));
          return { count: data.length, csv: toCsv(data, [{ key: "type", header: "نوع الترخيص" }, { key: "number", header: "رقم الترخيص" }, { key: "authority", header: "الجهة" }, { key: "company", header: "الشركة" }, { key: "branch", header: "القسم" }, { key: "issue", header: "تاريخ الإصدار" }, { key: "expiry", header: "تاريخ الانتهاء" }, { key: "state", header: "حالة الانتهاء" }, { key: "days", header: "الأيام المتبقية" }, { key: "verified", header: "التحقق اليدوي" }, { key: "lastVerified", header: "آخر تحقق" }, { key: "renewal", header: "التجديد" }, { key: "nextAction", header: "الإجراء التالي" }]) };
        }} />
        {access.officerOf.length > 0 && <button type="button" data-tour="add-license" onClick={() => setCreating(!creating)} className="btn-primary"><Plus size={17} aria-hidden="true" />إضافة ترخيص</button>}
      </>}>
        <SearchBox value={search} onChange={setSearch} placeholder="النوع أو الرقم أو الجهة" />
        <Field label="الشركة"><select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}><option value="">كل الشركات</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="حالة الانتهاء"><select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="">كل الحالات</option>{(Object.keys(stateText) as Shown[]).map((st) => <option key={st} value={st}>{stateText[st]}</option>)}</select></Field>
        <div className="pb-2 text-sm text-slate-600">تتطلب انتباهاً (منتهية أو خلال 30 يوماً): <Badge tone={attention ? "amber" : "green"}>{attention}</Badge></div>
      </Toolbar>
      {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {creating && <ScrollToForm dep={true}><CreateForm companies={companies.filter((c) => access.officerOf.includes(c.id))} branches={branches} fail={setError} done={done} close={() => setCreating(false)} /></ScrollToForm>}
      {panel && <ScrollToForm dep={panel}><ActionForm panel={panel} fail={setError} done={done} close={() => setPanel(null)} /></ScrollToForm>}

      <article data-tour="license-table" className="overflow-hidden border bg-white">
        <TableTitle icon={FileBadge} tone="blue" title="سجل التراخيص" subtitle="التراخيص وتواريخ انتهائها وحالة التجديد" count={`${visible.length} من ${rows.length}`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-right text-sm">
            <thead className="bg-slate-50"><tr>{["الترخيص", "الشركة / القسم", "الجهة", "الانتهاء", "حالة الصلاحية", "آخر تحقق يدوي", "التجديد", "إجراءات"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={8} />}
              {!loading && visible.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">{rows.length === 0 ? "لا توجد تراخيص مسجلة ضمن صلاحياتك. يمكن للمدير إضافة أول ترخيص من زر «إضافة ترخيص»." : "لا توجد نتائج مطابقة للتصفية."}</td></tr>}
              {visible.map(({ license, state, days }) => {
                const mayManage = access.managerOf.includes(license.company_id), mayVerify = access.officerOf.includes(license.company_id);
                return (
                  <tr key={license.id} className="border-t align-top">
                    <td className="px-3 py-3">{license.license_type}<small className="block text-slate-500" dir="ltr">{license.license_number}</small>{license.renewal_of && <small className="block text-slate-500">تجديد لترخيص سابق</small>}</td>
                    <td className="px-3 py-3">{license.companies?.name_ar ?? "—"}<small className="block text-slate-500">{license.branches?.name_ar ?? "على مستوى الشركة"}</small></td>
                    <td className="px-3 py-3">{license.authority}</td>
                    <td className="px-3 py-3"><span dir="ltr">{fmtDate(license.expiry_date)}</span>{state !== "superseded" && <small className="block text-slate-500">{days < 0 ? `منذ ${-days} يوماً` : days === 0 ? "ينتهي اليوم" : `بعد ${days} يوماً`}</small>}</td>
                    <td className="px-3 py-3"><Badge tone={stateTone[state]}>{stateText[state]}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={verifiedTone[license.verified_status] ?? "gray"}>{verifiedText[license.verified_status] ?? license.verified_status}</Badge><small className="block text-slate-500" dir="ltr">{fmtStamp(license.last_verified_at)}</small></td>
                    <td className="px-3 py-3"><Badge tone={renewalTone[license.renewal_status] ?? "gray"}>{renewalText[license.renewal_status] ?? license.renewal_status}</Badge>{license.next_action && <small className="block text-slate-500">{license.next_action}</small>}</td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-2">
                      <AttachmentsButton entityType="license" entityId={license.id} title={`${license.license_type} (${license.license_number})`} />
                      {mayVerify && <IconButton icon={ShieldCheck} tone="green" label="تسجيل تحقق" onClick={() => setPanel({ kind: "verify", license })} />}
                      {mayManage && license.renewal_status !== "renewed" && <><IconButton icon={Hourglass} tone="amber" label="متابعة التجديد" onClick={() => setPanel({ kind: "progress", license })} /><IconButton icon={Repeat2} tone="blue" label="تسجيل ترخيص مجدَّد" onClick={() => setPanel({ kind: "renew", license })} /></>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
      <p className="mt-3 text-xs text-slate-500">تُحسب التحذيرات من تاريخ الانتهاء المسجل (90 / 60 / 30 / 7 أيام) بتوقيت الرياض. حالة الصلاحية منفصلة عن التحقق اليدوي من المصدر الرسمي، والتجديد لا يُعتبر قائماً إلا بتسجيل ترخيص جديد مرتبط.</p>
    </div>
  );
}

function CreateForm({ companies, branches, fail, done, close }: { companies: Company[]; branches: Branch[]; fail(v: string): void; done(m: string): void; close(): void }) {
  const [company, setCompany] = useState(""); const [branch, setBranch] = useState(""); const [type, setType] = useState(""); const [authority, setAuthority] = useState("");
  const [number, setNumber] = useState(""); const [issued, setIssued] = useState(""); const [expires, setExpires] = useState(""); const [notes, setNotes] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (issued && expires < issued) { fail("تاريخ الانتهاء لا يمكن أن يسبق تاريخ الإصدار."); return; }
    const { error } = await supabase.rpc("create_license", { target_company: company, target_branch: branch || null, type_name: type, issuing_authority: authority, number_text: number, issued: issued || null, expires, note_text: notes || null });
    if (error) { fail(`تعذر إضافة الترخيص: ${error.message}`); return; }
    done("تمت إضافة الترخيص. لم يُعتبر متحققاً منه حتى يسجَّل تحقق يدوي.");
  }
  return (
    <form onSubmit={submit} className="mb-5 border bg-white p-5">
      <button type="button" onClick={close} className="float-left">إلغاء</button><h2 className="mb-3 font-bold">إضافة ترخيص</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="الشركة"><select required value={company} onChange={(e) => { setCompany(e.target.value); setBranch(""); }}><option value="">اختر</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="القسم"><select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">على مستوى الشركة</option>{branches.filter((b) => b.company_id === company).map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}</select></Field>
        <Field label="نوع الترخيص"><input required value={type} onChange={(e) => setType(e.target.value)} /></Field>
        <Field label="الجهة المصدرة"><input required value={authority} onChange={(e) => setAuthority(e.target.value)} /></Field>
        <Field label="رقم الترخيص"><input required dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label="تاريخ الإصدار"><input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
        <Field label="تاريخ الانتهاء"><input required type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="ملاحظات"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      </div>
      <button className="mt-4 bg-[#0c4b45] px-4 py-2 text-white">حفظ</button>
    </form>
  );
}

function ActionForm({ panel, fail, done, close }: { panel: NonNullable<Panel>; fail(v: string): void; done(m: string): void; close(): void }) {
  const { kind, license } = panel;
  const [outcome, setOutcome] = useState("verified_valid"); const [note, setNote] = useState(""); const [inProgress, setInProgress] = useState(true);
  const [number, setNumber] = useState(license.license_number); const [issued, setIssued] = useState(""); const [expires, setExpires] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (kind === "verify") {
      if (outcome === "verified_invalid" && !note.trim()) { fail("يجب توثيق سبب اعتبار الترخيص غير صالح."); return; }
      const { error } = await supabase.rpc("verify_license", { license_id: license.id, outcome, note_text: note || null });
      if (error) { fail(`تعذر تسجيل التحقق: ${error.message}`); return; }
      done("تم تسجيل التحقق اليدوي.");
    } else if (kind === "progress") {
      const { error } = await supabase.rpc("set_license_renewal_progress", { license_id: license.id, in_progress: inProgress, action_text: note || null });
      if (error) { fail(`تعذر تحديث حالة التجديد: ${error.message}`); return; }
      done("تم تحديث متابعة التجديد.");
    } else {
      if (expires <= license.expiry_date) { fail("يجب أن ينتهي الترخيص المجدَّد بعد انتهاء الترخيص السابق."); return; }
      const { error } = await supabase.rpc("renew_license", { old_license_id: license.id, number_text: number, issued: issued || null, expires });
      if (error) { fail(`تعذر تسجيل التجديد: ${error.message}`); return; }
      done("تم تسجيل الترخيص المجدَّد كسجل جديد مرتبط، وبقي السجل السابق محفوظاً.");
    }
  }
  const title = { verify: "تسجيل تحقق يدوي من المصدر الرسمي", progress: "متابعة التجديد", renew: "تسجيل ترخيص مجدَّد" }[kind];
  return (
    <form onSubmit={submit} className="mb-5 border border-slate-300 bg-white p-5">
      <button type="button" onClick={close} className="float-left">إلغاء</button><h2 className="mb-3 font-bold">{title}: {license.license_type} <span dir="ltr">({license.license_number})</span></h2>
      <div className="grid gap-3 md:grid-cols-3">
        {kind === "verify" && <><Field label="نتيجة التحقق"><select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="verified_valid">الترخيص ساري حسب المصدر</option><option value="verified_invalid">الترخيص غير صالح</option></select></Field><div className="md:col-span-2"><Field label={outcome === "verified_invalid" ? "ملاحظة (مطلوبة)" : "ملاحظة"}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div></>}
        {kind === "progress" && <><Field label="الحالة"><select value={inProgress ? "yes" : "no"} onChange={(e) => setInProgress(e.target.value === "yes")}><option value="yes">التجديد جارٍ</option><option value="no">لا يوجد تجديد جارٍ</option></select></Field><div className="md:col-span-2"><Field label="الإجراء التالي المطلوب"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div></>}
        {kind === "renew" && <><Field label="رقم الترخيص الجديد"><input required dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} /></Field><Field label="تاريخ الإصدار"><input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field><Field label="تاريخ الانتهاء الجديد"><input required type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field></>}
      </div>
      <button className="mt-4 bg-[#163433] px-4 py-2 text-white">تأكيد</button>
    </form>
  );
}
