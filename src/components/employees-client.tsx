"use client";

import { AttachmentsButton } from "@/components/attachments";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, ClipboardCheck, FileText, LogOut, Pencil, Plus, RefreshCw, Repeat2, UserMinus, UserPlus, Users } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { useAccess } from "@/components/app-shell";
import { ExportButton } from "@/components/export-button";
import { toCsv } from "@/lib/csv";
import { Badge, Field, IconButton, SearchBox, TableTitle, Toolbar, type Tone, SkeletonRows } from "@/components/ui";
import ScrollToForm from "@/components/scroll-to-form";
import { contractState, type ContractState } from "@/lib/contracts";

const employeeSchema = z.object({
  id: z.string().uuid(), employee_code: z.string(), company_id: z.string().uuid(), branch_id: z.string().uuid().nullable(), full_name: z.string(),
  job_title: z.string().nullable(), employment_status: z.string(), start_date: z.string().nullable(),
  companies: z.object({ name_ar: z.string() }).nullable(), branches: z.object({ name_ar: z.string() }).nullable(),
});
const contractSchema = z.object({
  id: z.string().uuid(), employee_id: z.string().uuid(), contract_identifier: z.string(), starts_at: z.string(), ends_at: z.string().nullable(),
  status: z.string(), verification_status: z.string(), last_verified_at: z.string().nullable(), renewed_from: z.string().uuid().nullable(), notes: z.string().nullable(),
});
const eventSchema = z.object({
  id: z.string().uuid(), employee_id: z.string().uuid(), event_type: z.string(), submitted_at: z.string(), notice_date: z.string().nullable(),
  expected_effective_at: z.string().nullable(), actual_effective_at: z.string().nullable(), process_status: z.string(), responsible_id: z.string().uuid().nullable(),
  follow_up: z.string().nullable(), notes: z.string().nullable(),
});
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });
const branchSchema = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name_ar: z.string() });
type Employee = z.infer<typeof employeeSchema>; type Contract = z.infer<typeof contractSchema>; type EmpEvent = z.infer<typeof eventSchema>;
type Company = z.infer<typeof companySchema>; type Branch = z.infer<typeof branchSchema>;

const employmentText: Record<string, string> = { active: "على رأس العمل", on_leave: "في إجازة", resigned: "استقال (منتهية الخدمة)", terminated: "أُنهيت خدمته", inactive: "غير نشط" };
const contractText: Record<ContractState, string> = { expired: "منتهي", critical: "حرج: أقل من 24 ساعة", within_7: "خلال 7 أيام", within_14: "خلال 14 يوماً", within_30: "خلال 30 يوماً", ok: "ساري", open_ended: "بدون تاريخ انتهاء", superseded: "مُجدَّد (سجل تاريخي)", closed: "مغلق" };
const contractTone: Record<ContractState, Tone> = { expired: "red", critical: "red", within_7: "red", within_14: "amber", within_30: "amber", ok: "green", open_ended: "gray", superseded: "gray", closed: "gray" };
const employmentTone: Record<string, Tone> = { active: "green", on_leave: "blue", resigned: "gray", terminated: "red", inactive: "gray" };
const verifyTone: Record<string, Tone> = { verified: "green", discrepancy: "red", not_verified: "gray" };
const processTone: Record<string, Tone> = { submitted: "amber", under_review: "blue", notice_period: "amber", completed: "gray", withdrawn: "gray", rejected: "gray" };
const verifyText: Record<string, string> = { not_verified: "لم يتم التحقق", verified: "تم التحقق", discrepancy: "توجد فروقات" };
const eventTypeText: Record<string, string> = { resignation: "استقالة", termination: "إنهاء خدمة" };
const processText: Record<string, string> = { submitted: "مقدَّمة", under_review: "قيد المراجعة", notice_period: "فترة الإشعار", completed: "مكتملة", withdrawn: "سُحبت", rejected: "مرفوضة" };
const OPEN = ["submitted", "under_review", "notice_period"];
const stamp = (t: string | null) => (t ? new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "—");
const riyadh = (date: string, time: string) => new Date(`${date}T${time}+03:00`).toISOString();

type Panel =
  | { kind: "employee" } | { kind: "contract"; employee?: Employee } | { kind: "verify" | "renew"; contract: Contract }
  | { kind: "event"; employee: Employee } | { kind: "progress" | "complete"; event: EmpEvent };

export default function EmployeesClient() {
  const access = useAccess();
  const [employees, setEmployees] = useState<Employee[]>([]); const [contracts, setContracts] = useState<Contract[]>([]); const [events, setEvents] = useState<EmpEvent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]); const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [companyFilter, setCompanyFilter] = useState(""); const [panel, setPanel] = useState<Panel | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [e, c, ev, co, br] = await Promise.all([
      supabase.from("employees").select("id,employee_code,company_id,branch_id,full_name,job_title,employment_status,start_date,companies(name_ar),branches(name_ar)").order("full_name"),
      supabase.from("contracts").select("id,employee_id,contract_identifier,starts_at,ends_at,status,verification_status,last_verified_at,renewed_from,notes").order("ends_at", { ascending: true, nullsFirst: false }),
      supabase.from("employee_events").select("id,employee_id,event_type,submitted_at,notice_date,expected_effective_at,actual_effective_at,process_status,responsible_id,follow_up,notes").order("submitted_at", { ascending: false }),
      supabase.from("companies").select("id,name_ar").order("name_ar"), supabase.from("branches").select("id,company_id,name_ar").order("name_ar"),
    ]);
    const failure = e.error ?? c.error ?? ev.error ?? co.error ?? br.error;
    if (failure) { setError(`تعذر تحميل بيانات الموظفين: ${failure.message}`); setLoading(false); return; }
    const pe = z.array(employeeSchema).safeParse(e.data), pc = z.array(contractSchema).safeParse(c.data), pv = z.array(eventSchema).safeParse(ev.data), pco = z.array(companySchema).safeParse(co.data), pb = z.array(branchSchema).safeParse(br.data);
    if (!pe.success || !pc.success || !pv.success || !pco.success || !pb.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    setEmployees(pe.data); setContracts(pc.data); setEvents(pv.data); setCompanies(pco.data); setBranches(pb.data); setNow(new Date()); setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const byId = useMemo(() => new Map(employees.map((x) => [x.id, x])), [employees]);
  const openEvent = (employeeId: string) => events.find((x) => x.employee_id === employeeId && OPEN.includes(x.process_status));
  const shown = employees.filter((x) => (!companyFilter || x.company_id === companyFilter) && (!search || [x.full_name, x.employee_code].some((v) => v.toLowerCase().includes(search.toLowerCase()))));
  const contractRows = contracts.filter((c) => byId.has(c.employee_id) && (!companyFilter || byId.get(c.employee_id)?.company_id === companyFilter)).map((c) => ({ contract: c, state: contractState(c.status, c.ends_at, now) }));
  const warnings = contractRows.filter((r) => ["expired", "critical", "within_7", "within_14", "within_30"].includes(r.state)).length;
  const done = (message: string) => { setPanel(null); setNotice(message); void load(); };
  const mayManage = (companyId: string) => access.managerOf.includes(companyId);
  const mayRecord = (companyId: string) => access.officerOf.includes(companyId);
  const th = (cols: string[]) => <thead className="bg-slate-50"><tr>{cols.map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>;

  return (
    <div className="p-5 md:p-8">
      <div data-tour="page-title" className="mb-6"><p className="text-sm text-slate-500">الرئيسية / الموظفون والعقود</p><h1 className="text-2xl font-bold">الموظفون والعقود والاستقالات</h1></div>
      <Toolbar actions={<>
        <IconButton icon={RefreshCw} label="تحديث" onClick={() => void load()} />
        <ExportButton label="تصدير الموظفين" filename="employees" kind="employees" companyId={companyFilter || null} build={() => {
          const data = shown.map((x) => ({ code: x.employee_code, name: x.full_name, company: x.companies?.name_ar ?? "", branch: x.branches?.name_ar ?? "", title: x.job_title ?? "", status: employmentText[x.employment_status] ?? x.employment_status, start: x.start_date ?? "" }));
          return { count: data.length, csv: toCsv(data, [{ key: "code", header: "الرمز الوظيفي" }, { key: "name", header: "الاسم" }, { key: "company", header: "الشركة" }, { key: "branch", header: "القسم" }, { key: "title", header: "المسمى" }, { key: "status", header: "حالة العمل" }, { key: "start", header: "تاريخ المباشرة" }]) };
        }} />
        <ExportButton label="تصدير العقود" filename="contracts" kind="contracts" companyId={companyFilter || null} build={() => {
          const data = contractRows.map(({ contract: c, state }) => ({ id: c.contract_identifier, employee: byId.get(c.employee_id)?.full_name ?? "", starts: c.starts_at, ends: c.ends_at ?? "", state: contractText[state], verification: verifyText[c.verification_status] ?? c.verification_status, lastVerified: c.last_verified_at ?? "" }));
          return { count: data.length, csv: toCsv(data, [{ key: "id", header: "رقم العقد" }, { key: "employee", header: "الموظف" }, { key: "starts", header: "البداية" }, { key: "ends", header: "النهاية" }, { key: "state", header: "حالة الانتهاء" }, { key: "verification", header: "التحقق" }, { key: "lastVerified", header: "آخر تحقق" }]) };
        }} />
        {access.managerOf.length > 0 && <><button type="button" onClick={() => setPanel({ kind: "contract" })} className="btn-secondary"><Plus size={17} aria-hidden="true" />إضافة عقد</button><button type="button" data-tour="add-employee" onClick={() => setPanel({ kind: "employee" })} className="btn-primary"><UserPlus size={17} aria-hidden="true" />إضافة موظف</button></>}
      </>}>
        <SearchBox value={search} onChange={setSearch} placeholder="الاسم أو الرمز الوظيفي" />
        <Field label="الشركة"><select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}><option value="">كل الشركات</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <div className="pb-2 text-sm text-slate-600">عقود تتطلب انتباهاً (منتهية أو خلال 30 يوماً): <Badge tone={warnings ? "amber" : "green"}>{warnings}</Badge></div>
      </Toolbar>
      {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {panel && <ScrollToForm dep={panel}><PanelForm panel={panel} employees={employees} companies={companies} branches={branches} managerOf={access.managerOf} userId={access.userId} fail={setError} done={done} close={() => setPanel(null)} /></ScrollToForm>}

      <article data-tour="employee-table" className="mb-6 overflow-hidden border bg-white">
        <TableTitle icon={Users} tone="blue" title="الموظفون" subtitle="بيانات الموظفين وحالتهم الوظيفية" count={shown.length} />
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-right text-sm">
          {th(["الموظف", "الشركة / القسم", "المسمى", "حالة العمل", "إجراء مفتوح", "إجراءات"])}
          <tbody>
            {loading && <SkeletonRows cols={6} />}
            {!loading && shown.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{employees.length === 0 ? "لا توجد سجلات موظفين ضمن صلاحياتك. بيانات الموظفين متاحة للموظفين المسؤولين عن الامتثال والمديرين فقط، ويمكن للمدير إضافة أول موظف." : "لا توجد نتائج مطابقة."}</td></tr>}
            {shown.map((x) => { const ev = openEvent(x.id); return (
              <tr key={x.id} className="border-t align-top">
                <td className="px-3 py-3">{x.full_name}<small className="block text-slate-500" dir="ltr">{x.employee_code}</small></td>
                <td className="px-3 py-3">{x.companies?.name_ar ?? "—"}<small className="block text-slate-500">{x.branches?.name_ar ?? "على مستوى الشركة"}</small></td>
                <td className="px-3 py-3">{x.job_title ?? "—"}</td>
                <td className="px-3 py-3"><Badge tone={employmentTone[x.employment_status] ?? "gray"}>{employmentText[x.employment_status] ?? x.employment_status}</Badge></td>
                <td className="px-3 py-3">{ev ? <Badge tone={processTone[ev.process_status] ?? "gray"}>{`${eventTypeText[ev.event_type]}: ${processText[ev.process_status]}`}</Badge> : "—"}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-2">{mayRecord(x.company_id) && x.employment_status === "active" && !ev && <IconButton icon={UserMinus} tone="amber" label="تسجيل استقالة / إنهاء" onClick={() => setPanel({ kind: "event", employee: x })} />}</div></td>
              </tr>); })}
          </tbody></table></div>
      </article>

      <article data-tour="contract-table" className="mb-6 overflow-hidden border bg-white">
        <TableTitle icon={FileText} tone="green" title="العقود" subtitle="عقود العمل وتواريخ انتهائها" count={contractRows.length} />
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm">
          {th(["العقد", "الموظف", "الفترة", "حالة الانتهاء", "التحقق", "إجراءات"])}
          <tbody>
            {loading && <SkeletonRows cols={6} rows={3} />}
            {!loading && contractRows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">لا توجد عقود مسجلة.</td></tr>}
            {contractRows.map(({ contract: c, state }) => { const emp = byId.get(c.employee_id); return (
              <tr key={c.id} className="border-t align-top">
                <td className="px-3 py-3"><span dir="ltr">{c.contract_identifier}</span>{c.renewed_from && <small className="block text-slate-500">تجديد لعقد سابق</small>}</td>
                <td className="px-3 py-3">{emp?.full_name ?? "—"}</td>
                <td className="px-3 py-3" dir="ltr">{stamp(c.starts_at)}<small className="block text-slate-500">{c.ends_at ? stamp(c.ends_at) : "—"}</small></td>
                <td className="px-3 py-3"><Badge tone={contractTone[state]}>{contractText[state]}</Badge></td>
                <td className="px-3 py-3"><Badge tone={verifyTone[c.verification_status] ?? "gray"}>{verifyText[c.verification_status] ?? c.verification_status}</Badge><small className="block text-slate-500" dir="ltr">{stamp(c.last_verified_at)}</small></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-2">
                  <AttachmentsButton entityType="contract" entityId={c.id} title={`${c.contract_identifier} — ${emp?.full_name ?? ""}`} />
                  {emp && mayRecord(emp.company_id) && c.status === "active" && <IconButton icon={ClipboardCheck} tone="green" label="تسجيل تحقق" onClick={() => setPanel({ kind: "verify", contract: c })} />}
                  {emp && mayManage(emp.company_id) && c.status === "active" && <IconButton icon={Repeat2} tone="blue" label="تسجيل تجديد" onClick={() => setPanel({ kind: "renew", contract: c })} />}
                </div></td>
              </tr>); })}
          </tbody></table></div>
      </article>

      <article data-tour="event-table" className="overflow-hidden border bg-white">
        <TableTitle icon={LogOut} tone="amber" title="الاستقالات وإنهاء الخدمة" subtitle="طلبات إنهاء الخدمة وحالة المعالجة" count={events.length} />
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm">
          {th(["الموظف", "النوع", "تاريخ التقديم", "التاريخ المتوقع للسريان", "التاريخ الفعلي", "حالة الإجراء", "إجراءات"])}
          <tbody>
            {loading && <SkeletonRows cols={7} rows={3} />}
            {!loading && events.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">لا توجد إجراءات استقالة أو إنهاء خدمة مسجلة.</td></tr>}
            {events.map((ev) => { const emp = byId.get(ev.employee_id); const open = OPEN.includes(ev.process_status); return (
              <tr key={ev.id} className="border-t align-top">
                <td className="px-3 py-3">{emp?.full_name ?? "—"}</td><td className="px-3 py-3">{eventTypeText[ev.event_type] ?? ev.event_type}</td>
                <td className="px-3 py-3" dir="ltr">{stamp(ev.submitted_at)}</td><td className="px-3 py-3" dir="ltr">{stamp(ev.expected_effective_at)}</td><td className="px-3 py-3" dir="ltr">{stamp(ev.actual_effective_at)}</td>
                <td className="px-3 py-3"><Badge tone={processTone[ev.process_status] ?? "gray"}>{processText[ev.process_status] ?? ev.process_status}</Badge>{ev.follow_up && <small className="block text-slate-500">{ev.follow_up}</small>}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-2">
                  <AttachmentsButton entityType="employee_event" entityId={ev.id} title={`${eventTypeText[ev.event_type] ?? ""} — ${emp?.full_name ?? ""}`} />
                  {open && emp && mayRecord(emp.company_id) && <IconButton icon={Pencil} label="تحديث الحالة" onClick={() => setPanel({ kind: "progress", event: ev })} />}
                  {open && emp && mayManage(emp.company_id) && <IconButton icon={CheckCheck} tone="primary" label="تأكيد انتهاء الخدمة" onClick={() => setPanel({ kind: "complete", event: ev })} />}
                </div></td>
              </tr>); })}
          </tbody></table></div>
      </article>
      <p className="mt-3 text-xs text-slate-500">تقديم الاستقالة لا يعني انتهاء الخدمة؛ تتغير حالة الموظف فقط عند تأكيد تاريخ السريان الفعلي من مستخدم مخوَّل. يسجل النظام المعلومات والمتابعة التشغيلية، ويتحقق المختصون من المتطلبات النظامية بأنفسهم.</p>
    </div>
  );
}

function PanelForm({ panel, employees, companies, branches, managerOf, userId, fail, done, close }: { panel: Panel; employees: Employee[]; companies: Company[]; branches: Branch[]; managerOf: string[]; userId: string | null; fail(v: string): void; done(m: string): void; close(): void }) {
  const [v, setV] = useState<Record<string, string>>({}); const set = (k: string) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const eventCompany = panel.kind === "event" ? panel.employee.company_id : null;
  useEffect(() => {
    if (!eventCompany || !managerOf.includes(eventCompany)) return;
    void supabase.rpc("list_company_assignees", { target_company: eventCompany }).then(({ data }) => { const p = z.array(z.object({ user_id: z.string().uuid(), display_name: z.string() })).safeParse(data); if (p.success) setAssignees(p.data.map((x) => ({ id: x.user_id, name: x.display_name }))); });
  }, [eventCompany, managerOf]);
  const g = (k: string) => v[k] ?? "";
  const run = async (promise: PromiseLike<{ error: { message: string } | null }>, label: string, ok: string) => { const { error } = await promise; if (error) { fail(`${label}: ${error.message}`); return; } done(ok); };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    switch (panel.kind) {
      case "employee": return run(supabase.rpc("create_employee", { target_company: g("company"), target_branch: g("branch") || null, code: g("code"), full_name_text: g("name"), title: g("title"), started: g("start") || null, owner: null }), "تعذر إضافة الموظف", "تمت إضافة الموظف.");
      case "contract": {
        const employeeId = panel.employee?.id ?? g("employee"); if (g("end") && g("end") <= g("start")) { fail("تاريخ انتهاء العقد يجب أن يلي تاريخ بدايته."); return; }
        return run(supabase.rpc("create_contract", { emp: employeeId, identifier: g("identifier"), starts: riyadh(g("start"), "00:00:00"), ends: g("end") ? riyadh(g("end"), "23:59:59") : null, note_text: g("note") || null }), "تعذر إضافة العقد", "تمت إضافة العقد ولم يُعتبر متحققاً منه.");
      }
      case "verify":
        if (g("outcome") === "discrepancy" && !g("note").trim()) { fail("يجب توثيق الفروقات المكتشفة."); return; }
        return run(supabase.rpc("verify_contract", { contract_id: panel.contract.id, outcome: g("outcome") || "verified", note_text: g("note") || null }), "تعذر تسجيل التحقق", "تم تسجيل التحقق.");
      case "renew":
        if (!g("end")) { fail("تاريخ نهاية العقد المجدَّد مطلوب."); return; }
        return run(supabase.rpc("renew_contract", { old_contract_id: panel.contract.id, identifier: g("identifier"), starts: riyadh(g("start"), "00:00:00"), ends: riyadh(g("end"), "23:59:59") }), "تعذر تسجيل التجديد", "تم تسجيل العقد المجدَّد كسجل جديد مرتبط، وبقي العقد السابق محفوظاً.");
      case "event":
        return run(supabase.rpc("record_employee_event", { emp: panel.employee.id, kind: g("type") || "resignation", submitted: riyadh(g("submitted"), "00:00:00"), notice: g("notice") || null, expected: g("expected") ? riyadh(g("expected"), "00:00:00") : null, responsible: g("responsible") || userId, note_text: g("note") || null }), "تعذر تسجيل الإجراء", "تم تسجيل الإجراء. حالة الموظف لم تتغير بعد.");
      case "progress":
        return run(supabase.rpc("update_employee_event", { event_id: panel.event.id, new_status: g("status") || "under_review", follow_up_text: g("followUp") || null, note_text: g("note") || null }), "تعذر تحديث الحالة", "تم تحديث حالة الإجراء.");
      case "complete": {
        if (!g("effective")) { fail("تاريخ السريان الفعلي مطلوب."); return; }
        return run(supabase.rpc("complete_employee_event", { event_id: panel.event.id, effective: riyadh(g("effective"), "00:00:00") }), "تعذر تأكيد انتهاء الخدمة", "تم تأكيد تاريخ السريان الفعلي وتحديث حالة الموظف.");
      }
    }
  }

  const title = { employee: "إضافة موظف", contract: "إضافة عقد", verify: "تسجيل تحقق من العقد", renew: "تسجيل عقد مجدَّد", event: "تسجيل استقالة / إنهاء خدمة", progress: "تحديث حالة الإجراء", complete: "تأكيد انتهاء الخدمة" }[panel.kind];
  const eligible = employees.filter((x) => managerOf.includes(x.company_id) && x.employment_status === "active");
  return (
    <form onSubmit={submit} className="mb-5 border border-slate-300 bg-white p-5">
      <button type="button" onClick={close} className="float-left">إلغاء</button><h2 className="mb-3 font-bold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {panel.kind === "employee" && <>
          <Field label="الشركة"><select required value={g("company")} onChange={(e) => setV((p) => ({ ...p, company: e.target.value, branch: "" }))}><option value="">اختر</option>{companies.filter((c) => managerOf.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
          <Field label="القسم"><select value={g("branch")} onChange={set("branch")}><option value="">على مستوى الشركة</option>{branches.filter((b) => b.company_id === g("company")).map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}</select></Field>
          <Field label="الرمز الوظيفي الداخلي"><input required dir="ltr" value={g("code")} onChange={set("code")} /></Field>
          <Field label="الاسم"><input required value={g("name")} onChange={set("name")} /></Field><Field label="المسمى الوظيفي"><input value={g("title")} onChange={set("title")} /></Field><Field label="تاريخ المباشرة"><input type="date" value={g("start")} onChange={set("start")} /></Field>
        </>}
        {panel.kind === "contract" && <>
          {!panel.employee && <Field label="الموظف"><select required value={g("employee")} onChange={set("employee")}><option value="">اختر</option>{eligible.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></Field>}
          <Field label="رقم العقد"><input required dir="ltr" value={g("identifier")} onChange={set("identifier")} /></Field><Field label="بداية العقد"><input required type="date" value={g("start")} onChange={set("start")} /></Field><Field label="نهاية العقد (فارغ = غير محدد)"><input type="date" value={g("end")} onChange={set("end")} /></Field>
          <div className="md:col-span-3"><Field label="ملاحظات"><input value={g("note")} onChange={set("note")} /></Field></div>
        </>}
        {panel.kind === "verify" && <><Field label="النتيجة"><select value={g("outcome") || "verified"} onChange={set("outcome")}><option value="verified">العقد موثَّق ومطابق</option><option value="discrepancy">توجد فروقات</option></select></Field><div className="md:col-span-2"><Field label={g("outcome") === "discrepancy" ? "ملاحظة (مطلوبة)" : "ملاحظة"}><input value={g("note")} onChange={set("note")} /></Field></div></>}
        {panel.kind === "renew" && <><Field label="رقم العقد الجديد"><input required dir="ltr" value={g("identifier")} onChange={set("identifier")} /></Field><Field label="بداية العقد المجدَّد"><input required type="date" value={g("start")} onChange={set("start")} /></Field><Field label="نهاية العقد المجدَّد"><input required type="date" value={g("end")} onChange={set("end")} /></Field></>}
        {panel.kind === "event" && <>
          <Field label="النوع"><select value={g("type") || "resignation"} onChange={set("type")}><option value="resignation">استقالة</option><option value="termination">إنهاء خدمة</option></select></Field>
          <Field label="تاريخ التقديم"><input required type="date" value={g("submitted")} onChange={set("submitted")} /></Field><Field label="تاريخ الإشعار"><input type="date" value={g("notice")} onChange={set("notice")} /></Field>
          <Field label="تاريخ السريان المتوقع"><input type="date" value={g("expected")} onChange={set("expected")} /></Field>
          {assignees.length > 0 && <Field label="المسؤول عن المتابعة"><select value={g("responsible")} onChange={set("responsible")}><option value="">أنا</option>{assignees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
          <Field label="ملاحظات"><input value={g("note")} onChange={set("note")} /></Field>
        </>}
        {panel.kind === "progress" && <><Field label="الحالة الجديدة"><select value={g("status") || "under_review"} onChange={set("status")}><option value="under_review">قيد المراجعة</option><option value="notice_period">فترة الإشعار</option><option value="withdrawn">سُحبت</option><option value="rejected">مرفوضة</option></select></Field><Field label="إجراء المتابعة"><input value={g("followUp")} onChange={set("followUp")} /></Field><Field label="ملاحظات"><input value={g("note")} onChange={set("note")} /></Field></>}
        {panel.kind === "complete" && <Field label="تاريخ السريان الفعلي"><input required type="date" max={new Date().toISOString().slice(0, 10)} value={g("effective")} onChange={set("effective")} /></Field>}
      </div>
      <button className="mt-4 bg-[#163433] px-4 py-2 text-white">تأكيد</button>
    </form>
  );
}
