"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, Camera, ClipboardList, FileBadge, FileWarning, Network, Hourglass, Pencil, Plus, Power, PowerOff, RefreshCw, ShieldCheck, Trash2, UsersRound, Wrench, X, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { useAccess } from "@/components/app-shell";
import { Badge, Field, IconButton, LoadingBlock } from "@/components/ui";
import ScrollToForm from "@/components/scroll-to-form";
import { weeklyCycleDates } from "@/lib/dates";
import { summarizeCycle } from "@/lib/cycle-summary";
import { effectiveLicenseState } from "@/lib/licenses";
import { MAX_AVATAR_BYTES, AVATAR_ACCEPT, validateAvatar } from "@/lib/avatar-validation";
import { fetchCompanyLogos, removeCompanyLogo, uploadCompanyLogo } from "@/lib/company-logo-client";

const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string(), legal_name: z.string().nullable(), active: z.boolean() });
const branchSchema = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name_ar: z.string(), active: z.boolean() });
const itemSchema = z.object({ company_id: z.string().uuid(), branch_id: z.string().uuid().nullable(), active: z.boolean(), risk_level: z.string() });
const checkSchema = z.object({ compliance_status: z.string(), review_status: z.string() });
const taskSchema = z.object({ company_id: z.string().uuid(), compliance_checks: z.union([checkSchema, z.array(checkSchema), z.null()]) });
const licenseSchema = z.object({ company_id: z.string().uuid(), expiry_date: z.string(), renewal_status: z.string() });
const actionSchema = z.object({ status: z.string(), compliance_checks: z.object({ inspection_tasks: z.object({ company_id: z.string().uuid() }).nullable() }).nullable() });
type Hue = "green" | "blue" | "red" | "amber" | "gray";
type Company = z.infer<typeof companySchema>; type Branch = z.infer<typeof branchSchema>;
type Panel = { kind: "company"; company?: Company } | { kind: "branch"; companyId: string; branch?: Branch } | { kind: "deactivate"; target: { type: "company"; company: Company } | { type: "branch"; branch: Branch } };

export default function CompaniesClient() {
  const access = useAccess();
  const [companies, setCompanies] = useState<Company[]>([]); const [branches, setBranches] = useState<Branch[]>([]);
  const [items, setItems] = useState<z.infer<typeof itemSchema>[]>([]); const [tasks, setTasks] = useState<z.infer<typeof taskSchema>[]>([]);
  const [licenses, setLicenses] = useState<z.infer<typeof licenseSchema>[]>([]); const [actions, setActions] = useState<z.infer<typeof actionSchema>[]>([]);
  const [cycleFound, setCycleFound] = useState(true);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null); const [now, setNow] = useState(() => new Date());
  const [logos, setLogos] = useState<Record<string, string>>({}); const [logoBusy, setLogoBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null); const logoTarget = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const today = new Date(); const { startsOn } = weeklyCycleDates(today);
    const cycle = await supabase.from("review_cycles").select("id").eq("starts_on", startsOn).maybeSingle();
    if (cycle.error) { setError(`تعذر تحميل الدورة الحالية: ${cycle.error.message}`); setLoading(false); return; }
    const [co, br, it, ta, li, ac] = await Promise.all([
      supabase.from("companies").select("id,name_ar,legal_name,active").order("name_ar"),
      supabase.from("branches").select("id,company_id,name_ar,active").order("name_ar"),
      supabase.from("compliance_items").select("company_id,branch_id,active,risk_level"),
      cycle.data ? supabase.from("inspection_tasks").select("company_id,compliance_checks(compliance_status,review_status)").eq("review_cycle_id", cycle.data.id) : Promise.resolve({ data: [], error: null }),
      supabase.from("licenses").select("company_id,expiry_date,renewal_status"),
      supabase.from("corrective_actions").select("status,compliance_checks(inspection_tasks(company_id))").neq("status", "resolved"),
    ]);
    const failure = co.error ?? br.error ?? it.error ?? ta.error ?? li.error ?? ac.error;
    if (failure) { setError(`تعذر تحميل بيانات الشركات: ${failure.message}`); setLoading(false); return; }
    const p = { co: z.array(companySchema).safeParse(co.data), br: z.array(branchSchema).safeParse(br.data), it: z.array(itemSchema).safeParse(it.data), ta: z.array(taskSchema).safeParse(ta.data), li: z.array(licenseSchema).safeParse(li.data), ac: z.array(actionSchema).safeParse(ac.data) };
    if (!p.co.success || !p.br.success || !p.it.success || !p.ta.success || !p.li.success || !p.ac.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    setCompanies(p.co.data); setBranches(p.br.data); setItems(p.it.data); setTasks(p.ta.data); setLicenses(p.li.data); setActions(p.ac.data); setCycleFound(!!cycle.data); setNow(today); setLoading(false);
    setLogos(await fetchCompanyLogos());
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const stats = useMemo(() => new Map(companies.map((c) => {
    const cTasks = tasks.filter((t) => t.company_id === c.id).map((t) => { const k = Array.isArray(t.compliance_checks) ? t.compliance_checks[0] : t.compliance_checks; return { compliance: k?.compliance_status ?? null, review: k?.review_status ?? null }; });
    const cItems = items.filter((i) => i.company_id === c.id && i.active);
    return [c.id, {
      cycle: summarizeCycle(cTasks), obligations: cItems.length, highRisk: cItems.filter((i) => i.risk_level === "high" || i.risk_level === "critical").length,
      licenseAttention: licenses.filter((l) => l.company_id === c.id && ["expired", "within_7", "within_30"].includes(effectiveLicenseState(l.renewal_status, l.expiry_date, now))).length,
      openActions: actions.filter((a) => a.compliance_checks?.inspection_tasks?.company_id === c.id).length,
      overdueActions: actions.filter((a) => a.status === "overdue" && a.compliance_checks?.inspection_tasks?.company_id === c.id).length,
    }];
  })), [companies, tasks, items, licenses, actions, now]);

  const done = (message: string) => { setPanel(null); setNotice(message); void load(); };
  const isAdmin = access.adminOf.length > 0;

  function chooseLogo(companyId: string) { logoTarget.current = companyId; fileInput.current?.click(); }
  async function pickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const companyId = logoTarget.current; e.target.value = "";
    if (!file || !companyId) return;
    setError(null); setNotice(null);
    // The server repeats this check on the real bytes; doing it here only saves a round trip.
    if (file.size > MAX_AVATAR_BYTES) { setError("حجم الصورة يتجاوز 2 ميغابايت."); return; }
    const checked = validateAvatar(new Uint8Array(await file.arrayBuffer()));
    if (!checked.ok) { setError(checked.error); return; }
    setLogoBusy(companyId);
    const result = await uploadCompanyLogo(companyId, file);
    if (!result.ok) { setLogoBusy(null); setError(result.error); return; }
    setLogos(await fetchCompanyLogos()); setLogoBusy(null); setNotice("تم تحديث شعار الشركة.");
  }
  async function dropLogo(companyId: string) {
    setError(null); setNotice(null); setLogoBusy(companyId);
    const result = await removeCompanyLogo(companyId);
    if (!result.ok) { setLogoBusy(null); setError(result.error); return; }
    setLogos(await fetchCompanyLogos()); setLogoBusy(null); setNotice("تم حذف شعار الشركة.");
  }

  const statTile = (label: string, value: string, Icon: LucideIcon, hue: Hue, alert = false) => (
    <div key={label} className="stat-tile" data-hue={hue} data-alert={alert}>
      <div className="icon-chip"><Icon size={18} aria-hidden="true" /></div>
      <div className="min-w-0"><dt className="text-xs leading-snug text-slate-500">{label}</dt><dd className="mt-0.5 text-lg font-bold leading-tight">{value}</dd></div>
    </div>
  );

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div data-tour="page-title"><p className="text-sm text-slate-500">الرئيسية / الشركات والأقسام</p><h1 className="text-2xl font-bold">الشركات والأقسام</h1></div>
        <div className="flex items-center gap-3">
          <IconButton icon={RefreshCw} label="تحديث" onClick={() => void load()} />
          {isAdmin && <button type="button" data-tour="add-company" onClick={() => setPanel({ kind: "company" })} className="btn-primary"><Plus size={17} aria-hidden="true" />إضافة شركة</button>}
        </div>
      </div>
      {error && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {!cycleFound && !loading && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">لا توجد دورة تفتيش للأسبوع الحالي بعد؛ شغّل المجدول (npm run scheduler). لا تُعرض أي نتائج امتثال دون مهام فعلية.</p>}
      {panel && <ScrollToForm dep={panel}><PanelForm panel={panel} fail={setError} done={done} close={() => setPanel(null)} /></ScrollToForm>}
      {loading && companies.length === 0 && <LoadingBlock />}
      {!loading && companies.length === 0 && <p className="rounded-[14px] bg-white p-8 text-center text-slate-500 shadow-[0_1px_2px_rgb(15_42_42/0.05),0_4px_14px_rgb(15_42_42/0.06)]">لا توجد شركات ضمن صلاحياتك. {isAdmin ? "أضف أول شركة من زر «إضافة شركة»." : "تواصل مع مسؤول النظام."}</p>}
      <input ref={fileInput} type="file" accept={AVATAR_ACCEPT} onChange={(e) => void pickLogo(e)} className="hidden" aria-hidden="true" tabIndex={-1} />

      <div className="grid gap-8">
        {companies.map((c) => {
          const s = stats.get(c.id); const cBranches = branches.filter((b) => b.company_id === c.id); const manage = access.managerOf.includes(c.id); const admin = access.adminOf.includes(c.id);
          const logo = logos[c.id];
          return (
            <article key={c.id} data-tour="company-card" className={c.active ? "" : "opacity-75"}>
              <header className="company-head">
                <div className="logo-frame">
                  {logo ? <Image src={logo} alt={`شعار ${c.name_ar}`} width={168} height={168} unoptimized /> : <Building2 size={34} className="text-slate-300" aria-hidden="true" />}
                  {admin && <button type="button" disabled={logoBusy === c.id} onClick={() => chooseLogo(c.id)} aria-label={`تغيير شعار ${c.name_ar}`} className="icon-btn icon-btn-primary logo-edit"><Camera size={14} aria-hidden="true" /></button>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold">{c.name_ar}</h2>{c.active ? <Badge tone="green">نشطة</Badge> : <Badge tone="gray">غير نشطة</Badge>}</div>
                  <p className="mt-1 text-sm text-slate-500">{c.legal_name ?? "الاسم القانوني غير مسجل"}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><Network size={14} aria-hidden="true" />{cBranches.length} قسم</span>
                    {s && <span className="inline-flex items-center gap-1.5"><ClipboardList size={14} aria-hidden="true" />{s.obligations} التزاماً نشطاً ({s.highRisk} عالي المخاطر)</span>}
                    {admin && logo && <button type="button" disabled={logoBusy === c.id} onClick={() => void dropLogo(c.id)} className="inline-flex items-center gap-1 text-red-700 underline"><Trash2 size={13} aria-hidden="true" />حذف الشعار</button>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {admin && <button type="button" onClick={() => setPanel({ kind: "company", company: c })} className="btn-secondary btn-sm"><Pencil size={15} aria-hidden="true" />تعديل</button>}
                  {admin && (c.active
                    ? <button type="button" onClick={() => setPanel({ kind: "deactivate", target: { type: "company", company: c } })} className="btn-danger btn-sm"><PowerOff size={15} aria-hidden="true" />تعطيل</button>
                    : <button type="button" onClick={() => void supabase.rpc("set_company_active", { company_id: c.id, make_active: true }).then(({ error: e }) => (e ? setError(`تعذر التفعيل: ${e.message}`) : done("تم تفعيل الشركة.")))} className="btn-secondary btn-sm"><Power size={15} aria-hidden="true" />إعادة تفعيل</button>)}
                  {manage && c.active && <button type="button" onClick={() => setPanel({ kind: "branch", companyId: c.id })} className="btn-primary btn-sm"><Plus size={15} aria-hidden="true" />إضافة قسم</button>}
                </div>
              </header>
              {s && (
                <dl className="grid gap-3 p-6 pb-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                  {statTile("ممتثلة ومعتمدة (الأسبوع الحالي)", s.cycle.denominator ? `${s.cycle.compliantApproved} من ${s.cycle.denominator}` : "لا مهام", ShieldCheck, "green")}
                  {statTile("تتطلب إجراء", String(s.cycle.actionRequired), AlertTriangle, s.cycle.actionRequired ? "red" : "gray", s.cycle.actionRequired > 0)}
                  {statTile("غير متحقق منها", String(s.cycle.unverified), FileWarning, s.cycle.unverified ? "amber" : "gray", s.cycle.unverified > 0)}
                  {statTile("بانتظار المراجعة", String(s.cycle.awaitingReview), Hourglass, s.cycle.awaitingReview ? "amber" : "gray")}
                  {statTile("تراخيص تتطلب انتباهاً", String(s.licenseAttention), FileBadge, s.licenseAttention ? "amber" : "blue", s.licenseAttention > 0)}
                  {statTile("إجراءات تصحيحية مفتوحة", `${s.openActions}${s.overdueActions ? ` (${s.overdueActions} متأخر)` : ""}`, Wrench, s.overdueActions ? "red" : "blue", s.overdueActions > 0)}
                </dl>
              )}
              <div className="p-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700"><Network size={16} aria-hidden="true" />الأقسام</h3>
                {cBranches.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">لا توجد أقسام مسجلة.</p> : (
                  <ul data-tour="branch-list" className="grid gap-3 text-sm lg:grid-cols-2">{cBranches.map((b) => (
                    <li key={b.id} className="branch-row">
                      <span className="flex min-w-0 items-center gap-3"><span className="icon-chip" data-hue={b.active ? "blue" : "gray"}><UsersRound size={17} aria-hidden="true" /></span><span className="min-w-0"><b className="block truncate">{b.name_ar}{!b.active && <span className="mr-2 align-middle"><Badge tone="gray">غير نشط</Badge></span>}</b><small className="text-xs text-slate-500">{items.filter((i) => i.branch_id === b.id && i.active).length} التزام نشط</small></span></span>
                      {manage && <span className="flex gap-2">
                        <button type="button" onClick={() => setPanel({ kind: "branch", companyId: c.id, branch: b })} className="btn-secondary btn-sm"><Pencil size={14} aria-hidden="true" />تعديل</button>
                        {b.active
                          ? <button type="button" onClick={() => setPanel({ kind: "deactivate", target: { type: "branch", branch: b } })} className="btn-danger btn-sm"><PowerOff size={14} aria-hidden="true" />تعطيل</button>
                          : <button type="button" onClick={() => void supabase.rpc("set_branch_active", { branch_id: b.id, make_active: true }).then(({ error: e }) => (e ? setError(`تعذر التفعيل: ${e.message}`) : done("تم تفعيل القسم.")))} className="btn-secondary btn-sm"><Power size={14} aria-hidden="true" />إعادة تفعيل</button>}
                      </span>}
                    </li>))}</ul>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-slate-500">«ممتثلة ومعتمدة» تعني نتيجة ممتثل معتمدة من مراجع؛ المهام بلا نتيجة أو بنتيجة غير معتمدة لا تُحتسب ممتثلة، والمهام «غير منطبقة» المعتمدة تُستبعد من المقام. لا تُحذف الشركات أو الأقسام، بل تُعطَّل بسبب موثق. شعار الشركة: PNG أو JPG أو WebP حتى 2 ميغابايت، ويديره مسؤول النظام.</p>
    </div>
  );
}

function PanelForm({ panel, fail, done, close }: { panel: Panel; fail(v: string): void; done(m: string): void; close(): void }) {
  const initial = panel.kind === "company" ? panel.company?.name_ar ?? "" : panel.kind === "branch" ? panel.branch?.name_ar ?? "" : "";
  const [name, setName] = useState(initial); const [legal, setLegal] = useState(panel.kind === "company" ? panel.company?.legal_name ?? "" : ""); const [reason, setReason] = useState("");
  const run = async (promise: PromiseLike<{ error: { message: string } | null }>, label: string, ok: string) => { const { error } = await promise; if (error) { fail(`${label}: ${error.message}`); return; } done(ok); };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (panel.kind === "company") return panel.company
      ? run(supabase.rpc("update_company", { company_id: panel.company.id, name_text: name, legal_name_text: legal || null }), "تعذر تعديل الشركة", "تم تعديل الشركة.")
      : run(supabase.rpc("create_company", { name_text: name, legal_name_text: legal || null }), "تعذر إضافة الشركة", "تمت إضافة الشركة، ومُنحت لك صلاحية مسؤول النظام عليها.");
    if (panel.kind === "branch") return panel.branch
      ? run(supabase.rpc("update_branch", { branch_id: panel.branch.id, name_text: name }), "تعذر تعديل القسم", "تم تعديل القسم.")
      : run(supabase.rpc("create_branch", { target_company: panel.companyId, name_text: name }), "تعذر إضافة القسم", "تمت إضافة القسم.");
    if (!reason.trim()) { fail("سبب التعطيل مطلوب."); return; }
    return panel.target.type === "company"
      ? run(supabase.rpc("set_company_active", { company_id: panel.target.company.id, make_active: false, reason }), "تعذر تعطيل الشركة", "تم تعطيل الشركة.")
      : run(supabase.rpc("set_branch_active", { branch_id: panel.target.branch.id, make_active: false, reason }), "تعذر تعطيل القسم", "تم تعطيل القسم.");
  }
  const title = panel.kind === "company" ? (panel.company ? "تعديل الشركة" : "إضافة شركة") : panel.kind === "branch" ? (panel.branch ? "تعديل القسم" : "إضافة قسم") : `تعطيل ${panel.target.type === "company" ? panel.target.company.name_ar : panel.target.branch.name_ar}`;
  return (
    <form onSubmit={submit} className="mb-8 border bg-white">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2><button type="button" onClick={close} aria-label="إغلاق" className="icon-btn"><X size={17} aria-hidden="true" /></button></div>
      <div className="grid gap-4 md:grid-cols-2">
        {panel.kind !== "deactivate" && <Field label={panel.kind === "company" ? "اسم الشركة" : "اسم القسم"}><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        {panel.kind === "company" && <Field label="الاسم القانوني (اختياري)"><input value={legal} onChange={(e) => setLegal(e.target.value)} /></Field>}
        {panel.kind === "deactivate" && <Field label="سبب التعطيل (مطلوب)"><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        {panel.kind === "deactivate" && panel.target.type === "branch" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2">سيتم أيضاً تعطيل الالتزامات النشطة التابعة لهذا القسم. وإن كان فيه موظفون نشطون فانقلهم إلى قسم آخر أولاً.</p>}
      </div>
      <button className={`mt-5 ${panel.kind === "deactivate" ? "btn-danger" : "btn-primary"}`}>{panel.kind === "deactivate" ? "تأكيد التعطيل" : "حفظ"}</button>
    </form>
  );
}
