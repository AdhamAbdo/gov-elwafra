"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, FileBadge, FileText, FileWarning, Gauge, Network, Hourglass, RefreshCw, RotateCcw, ShieldCheck, TimerOff, TrendingUp, UserMinus, Wrench, type LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { Field, TableTitle, SkeletonCards, LoadingBlock } from "@/components/ui";
import { summarizeCycle, type TaskBucket } from "@/lib/cycle-summary";
import { buildTrend, cycleRates, filterTasks, overdueTasks, pct, type DashTask } from "@/lib/dashboard";
import { effectiveLicenseState } from "@/lib/licenses";
import { contractState } from "@/lib/contracts";
import { weeklyCycleDates } from "@/lib/dates";

const ROW_LIMIT = 1000; // PostgREST's default page size; hitting it is reported to the user rather than hidden.
// Status colours (validated reference palette). Text never wears these; the legend and table view carry the meaning too.
const C = { good: "#15a36b", warning: "#f5a524", critical: "#dc4a4a", neutral: "#9aa8b5", blue: "#2563eb", teal: "#0f766e", grid: "#e8edf2", ink: "#0f2a2a", muted: "#64748b", surface: "#ffffff" };
const tooltipStyle = { borderRadius: 10, border: 0, boxShadow: "0 8px 28px rgb(15 42 42 / 0.16)", direction: "rtl" as const, fontSize: 13, padding: "8px 12px" };
const legendStyle = { fontSize: 12.5, paddingTop: 8 };
type Hue = "green" | "blue" | "red" | "amber" | "gray";
const INITIAL_FILTERS = { companyId: "", branchId: "", category: "", authority: "", ownerId: "", state: "" as TaskBucket | "", cycleId: "", from: "", to: "" };

const one = <T extends z.ZodTypeAny>(s: T) => z.union([s, z.array(s)]).nullable().transform((v) => (Array.isArray(v) ? v[0] ?? null : v)) as z.ZodType<z.infer<T> | null>;
const cycleSchema = z.object({ id: z.string().uuid(), starts_on: z.string(), ends_on: z.string() });
const checkSchema = z.object({ compliance_status: z.string(), review_status: z.string() });
const taskSchema = z.object({
  review_cycle_id: z.string().uuid(), company_id: z.string().uuid(), branch_id: z.string().uuid().nullable(), assigned_to: z.string().uuid().nullable(),
  compliance_items: one(z.object({ category: z.string(), authority: z.string().nullable(), risk_level: z.string() })),
  compliance_checks: z.union([checkSchema, z.array(checkSchema), z.null()]),
});
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });
const branchSchema = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name_ar: z.string() });
const licenseSchema = z.object({ company_id: z.string().uuid(), branch_id: z.string().uuid().nullable(), expiry_date: z.string(), renewal_status: z.string() });
const contractSchema = z.object({ status: z.string(), ends_at: z.string().nullable(), employees: one(z.object({ company_id: z.string().uuid(), branch_id: z.string().uuid().nullable() })) });
const eventSchema = z.object({ process_status: z.string(), employees: one(z.object({ company_id: z.string().uuid(), branch_id: z.string().uuid().nullable() })) });
const actionSchema = z.object({ status: z.string(), compliance_checks: one(z.object({ inspection_tasks: one(z.object({ company_id: z.string().uuid(), branch_id: z.string().uuid().nullable(), compliance_items: one(z.object({ risk_level: z.string() })) })) })) });
const profileSchema = z.object({ id: z.string().uuid(), display_name: z.string() });

const stateText: Record<TaskBucket, string> = { compliantApproved: "ممتثل ومعتمد", actionRequired: "يتطلب إجراء", awaitingReview: "بانتظار المراجعة", unverified: "غير متحقق", notApplicable: "غير منطبق" };
const fmt = (v: number | null) => (v === null ? "—" : `${v}%`);

export default function OverviewClient() {
  const [cycles, setCycles] = useState<z.infer<typeof cycleSchema>[]>([]); const [tasks, setTasks] = useState<DashTask[]>([]);
  const [companies, setCompanies] = useState<z.infer<typeof companySchema>[]>([]); const [branches, setBranches] = useState<z.infer<typeof branchSchema>[]>([]);
  const [licenses, setLicenses] = useState<z.infer<typeof licenseSchema>[]>([]); const [contracts, setContracts] = useState<z.infer<typeof contractSchema>[]>([]);
  const [events, setEvents] = useState<z.infer<typeof eventSchema>[]>([]); const [actions, setActions] = useState<z.infer<typeof actionSchema>[]>([]); const [people, setPeople] = useState<z.infer<typeof profileSchema>[]>([]);
  const [truncated, setTruncated] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [now, setNow] = useState(() => new Date());
  const [f, setF] = useState(INITIAL_FILTERS);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value, ...(k === "companyId" ? { branchId: "" } : {}) }));

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const cy = await supabase.from("review_cycles").select("id,starts_on,ends_on").order("starts_on", { ascending: false }).limit(12);
    if (cy.error) { setError(`تعذر تحميل الدورات: ${cy.error.message}`); setLoading(false); return; }
    const pcy = z.array(cycleSchema).safeParse(cy.data);
    if (!pcy.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    const ids = pcy.data.map((c) => c.id);
    const [t, co, br, li, ct, ev, ac, pr] = await Promise.all([
      ids.length ? supabase.from("inspection_tasks").select("review_cycle_id,company_id,branch_id,assigned_to,compliance_items(category,authority,risk_level),compliance_checks(compliance_status,review_status)").in("review_cycle_id", ids).limit(ROW_LIMIT) : Promise.resolve({ data: [], error: null }),
      supabase.from("companies").select("id,name_ar").order("name_ar"), supabase.from("branches").select("id,company_id,name_ar").order("name_ar"),
      supabase.from("licenses").select("company_id,branch_id,expiry_date,renewal_status"),
      supabase.from("contracts").select("status,ends_at,employees(company_id,branch_id)").eq("status", "active"),
      supabase.from("employee_events").select("process_status,employees(company_id,branch_id)").in("process_status", ["submitted", "under_review", "notice_period"]),
      supabase.from("corrective_actions").select("status,compliance_checks(inspection_tasks(company_id,branch_id,compliance_items(risk_level)))").neq("status", "resolved"),
      supabase.from("user_profiles").select("id,display_name"),
    ]);
    const failure = t.error ?? co.error ?? br.error ?? li.error ?? ct.error ?? ev.error ?? ac.error ?? pr.error;
    if (failure) { setError(`تعذر تحميل بيانات اللوحة: ${failure.message}`); setLoading(false); return; }
    const p = { t: z.array(taskSchema).safeParse(t.data), co: z.array(companySchema).safeParse(co.data), br: z.array(branchSchema).safeParse(br.data), li: z.array(licenseSchema).safeParse(li.data), ct: z.array(contractSchema).safeParse(ct.data), ev: z.array(eventSchema).safeParse(ev.data), ac: z.array(actionSchema).safeParse(ac.data), pr: z.array(profileSchema).safeParse(pr.data) };
    if (!p.t.success || !p.co.success || !p.br.success || !p.li.success || !p.ct.success || !p.ev.success || !p.ac.success || !p.pr.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    setCycles(pcy.data); setCompanies(p.co.data); setBranches(p.br.data); setLicenses(p.li.data); setContracts(p.ct.data); setEvents(p.ev.data); setActions(p.ac.data); setPeople(p.pr.data);
    setTruncated(p.t.data.length >= ROW_LIMIT);
    setTasks(p.t.data.map((row) => { const k = Array.isArray(row.compliance_checks) ? row.compliance_checks[0] : row.compliance_checks; return { cycleId: row.review_cycle_id, companyId: row.company_id, branchId: row.branch_id, assignedTo: row.assigned_to, category: row.compliance_items?.category ?? "—", authority: row.compliance_items?.authority ?? null, risk: row.compliance_items?.risk_level ?? "medium", compliance: k?.compliance_status ?? null, review: k?.review_status ?? null }; }));
    setNow(new Date()); setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const today = useMemo(() => new Date(now.getTime() + 3 * 36e5).toISOString().slice(0, 10), [now]);
  const rangeCycles = cycles.filter((c) => (!f.from || c.starts_on >= f.from) && (!f.to || c.ends_on <= f.to));
  const currentStart = weeklyCycleDates(now).startsOn;
  const selected = rangeCycles.find((c) => c.id === f.cycleId) ?? rangeCycles.find((c) => c.starts_on === currentStart) ?? rangeCycles[0] ?? null;
  const base = { companyId: f.companyId, branchId: f.branchId, category: f.category, authority: f.authority, ownerId: f.ownerId };
  const inRange = useMemo(() => { const ids = new Set(rangeCycles.map((c) => c.id)); return tasks.filter((t) => ids.has(t.cycleId)); }, [tasks, rangeCycles]);
  const cycleTasks = useMemo(() => filterTasks(inRange.filter((t) => t.cycleId === selected?.id), { ...base, state: f.state }), [inRange, selected, f.companyId, f.branchId, f.category, f.authority, f.ownerId, f.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const rates = cycleRates(cycleTasks); const s = rates.summary;
  const trend = useMemo(() => buildTrend(rangeCycles.map((c) => ({ id: c.id, startsOn: c.starts_on })), filterTasks(inRange, base)), [rangeCycles, inRange, f.companyId, f.branchId, f.category, f.authority, f.ownerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const ended = new Set(rangeCycles.filter((c) => c.ends_on < today).map((c) => c.id));
  const overdue = overdueTasks(filterTasks(inRange, base), ended).length;
  const highRisk = cycleTasks.filter((t) => t.compliance === "action_required" && (t.risk === "high" || t.risk === "critical")).length;

  const scope = (x: { company_id: string; branch_id: string | null } | null | undefined) => !!x && (!f.companyId || x.company_id === f.companyId) && (!f.branchId || x.branch_id === f.branchId);
  const licExpired = licenses.filter((l) => scope(l) && effectiveLicenseState(l.renewal_status, l.expiry_date, now) === "expired").length;
  const licSoon = licenses.filter((l) => scope(l) && ["within_7", "within_30"].includes(effectiveLicenseState(l.renewal_status, l.expiry_date, now))).length;
  const conSoon = contracts.filter((c) => scope(c.employees) && ["expired", "critical", "within_7", "within_14", "within_30"].includes(contractState(c.status, c.ends_at, now))).length;
  const openResign = events.filter((e) => scope(e.employees)).length;
  const actionsScoped = actions.filter((a) => scope(a.compliance_checks?.inspection_tasks));
  const openActions = actionsScoped.length; const overdueActions = actionsScoped.filter((a) => a.status === "overdue").length;

  const categories = [...new Set(tasks.map((t) => t.category))].sort(); const authorities = [...new Set(tasks.map((t) => t.authority).filter((x): x is string => !!x))].sort();
  const compName = new Map(companies.map((c) => [c.id, c.name_ar]));
  const compare = useMemo(() => companies.filter((c) => !f.companyId || c.id === f.companyId).map((c) => { const sm = summarizeCycle(cycleTasks.filter((t) => t.companyId === c.id)); return { id: c.id, name: c.name_ar, ...sm }; }).filter((r) => r.total > 0), [companies, cycleTasks, f.companyId]);
  const branchRows = useMemo(() => branches.filter((b) => (!f.companyId || b.company_id === f.companyId) && (!f.branchId || b.id === f.branchId)).map((b) => { const sm = summarizeCycle(cycleTasks.filter((t) => t.branchId === b.id)); return { id: b.id, name: b.name_ar, company: compName.get(b.company_id) ?? "—", ...sm }; }).filter((r) => r.total > 0), [branches, cycleTasks, f.companyId, f.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tile = (label: string, value: string, Icon: LucideIcon, hue: Hue, sub?: string, alert = false) => (
    <div key={label} className="kpi" data-hue={hue} data-alert={alert}>
      <div className="flex items-start gap-3"><div className="icon-chip"><Icon size={19} aria-hidden="true" /></div><dt className="pt-0.5 text-[13px] font-medium leading-snug text-slate-600">{label}</dt></div>
      <dd className="text-3xl font-bold leading-none">{value}</dd>
      {sub && <small className="text-xs leading-snug text-slate-500">{sub}</small>}
    </div>
  );

  return (
    <section className="p-5 pb-0 md:p-8 md:pb-0">
      <div className="mb-4 flex justify-between gap-3">
        <div data-tour="page-title"><p className="text-sm text-slate-500">الرئيسية / لوحة الإدارة العامة</p><h1 className="text-2xl font-bold">لوحة الإدارة العامة</h1></div>
        <button onClick={() => void load()} aria-label="تحديث"><RefreshCw className={loading ? "animate-spin" : ""} size={19} /></button>
      </div>
      {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {truncated && <p role="alert" className="mb-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">تجاوز عدد المهام حد التحميل ({ROW_LIMIT})؛ الأرقام المعروضة قد لا تشمل كل السجلات. ضيّق الفترة أو الدورة.</p>}

      <div className="toolbar filter-grid" data-tour="filters">
        <Field label="الدورة"><select value={selected?.id ?? ""} onChange={set("cycleId")}>{rangeCycles.map((c) => <option key={c.id} value={c.id}>{c.starts_on} → {c.ends_on}</option>)}</select></Field>
        <Field label="من تاريخ"><input type="date" value={f.from} onChange={set("from")} /></Field><Field label="إلى تاريخ"><input type="date" value={f.to} onChange={set("to")} /></Field>
        <Field label="الشركة"><select value={f.companyId} onChange={set("companyId")}><option value="">الكل</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="القسم"><select value={f.branchId} onChange={set("branchId")}><option value="">الكل</option>{branches.filter((b) => !f.companyId || b.company_id === f.companyId).map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}</select></Field>
        <Field label="الفئة"><select value={f.category} onChange={set("category")}><option value="">الكل</option>{categories.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="الجهة"><select value={f.authority} onChange={set("authority")}><option value="">الكل</option>{authorities.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="حالة الامتثال"><select value={f.state} onChange={set("state")}><option value="">الكل</option>{(["compliantApproved", "actionRequired", "awaitingReview", "unverified", "notApplicable"] as TaskBucket[]).map((k) => <option key={k} value={k}>{stateText[k]}</option>)}</select></Field>
        <Field label="مسؤول المهمة"><select value={f.ownerId} onChange={set("ownerId")}><option value="">الكل</option><option value="unassigned">غير مسندة</option>{people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field>
        <button type="button" onClick={() => setF(INITIAL_FILTERS)} className="btn-secondary"><RotateCcw size={16} aria-hidden="true" />إعادة ضبط المرشحات</button>
      </div>

      {!loading && !selected && <p className="mb-6 border bg-white p-6 text-center text-slate-500">لا توجد دورات تفتيش بعد؛ شغّل المجدول (npm run scheduler) لإنشاء مهام الأسبوع. لا تُعرض أي مؤشرات امتثال دون مهام فعلية.</p>}
      {loading && !selected && (<>
        <dl aria-busy="true" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><SkeletonCards count={10} /></dl>
        <div className="mb-6 grid gap-5 xl:grid-cols-2"><article><LoadingBlock /></article><article><LoadingBlock /></article></div>
      </>)}
      {selected && (<>
        <dl data-tour="kpis" className="mb-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {tile("نسبة إنجاز الفحص", fmt(rates.completion), Gauge, "blue", `${cycleTasks.filter((t) => t.compliance !== null).length} من ${cycleTasks.length} مهمة لها نتيجة مرسلة`)}
          {tile("نسبة الامتثال المعتمد", fmt(rates.compliance), ShieldCheck, "green", `${s.compliantApproved} من ${s.denominator} (غير المتحقق وغير المعتمد يبقى في المقام)`)}
          {tile("تتطلب إجراء", String(s.actionRequired), AlertTriangle, s.actionRequired ? "red" : "green", `${highRisk} منها عالية المخاطر`, s.actionRequired > 0)}
          {tile("غير متحقق منها", String(s.unverified), FileWarning, s.unverified ? "amber" : "gray", "لا تُحتسب ممتثلة", s.unverified > 0)}
          {tile("بانتظار المراجعة", String(s.awaitingReview), Hourglass, "amber")}
          {tile("مهام متأخرة", String(overdue), TimerOff, overdue ? "red" : "green", "دورات منتهية بلا نتيجة", overdue > 0)}
          {tile("تراخيص منتهية / خلال 30 يوماً", `${licExpired} / ${licSoon}`, FileBadge, licExpired ? "red" : licSoon ? "amber" : "blue", undefined, licExpired > 0 || licSoon > 0)}
          {tile("عقود تتطلب انتباهاً", String(conSoon), FileText, conSoon ? "amber" : "blue", "منتهية أو خلال 30 يوماً", conSoon > 0)}
          {tile("استقالات / إنهاءات مفتوحة", String(openResign), UserMinus, "gray")}
          {tile("إجراءات تصحيحية مفتوحة", String(openActions), Wrench, overdueActions ? "red" : "blue", `${overdueActions} متأخر`, overdueActions > 0)}
        </dl>
        <p className="mb-6 text-xs text-slate-500">الأرقام من سجلات قاعدة البيانات ضمن صلاحياتك. المؤشرات الخاصة بالدورة تتبع الدورة والمرشحات المختارة؛ التراخيص والعقود والاستقالات والإجراءات تتبع الشركة والقسم فقط.</p>

        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <article data-tour="company-chart">
            <TableTitle icon={BarChart3} tone="blue" title="مقارنة الشركات — الدورة المختارة" subtitle="عدد المهام حسب حالة الامتثال" />
            <div className="p-5">
            {compare.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">لا توجد مهام مطابقة.</p> : (
              <div dir="ltr" style={{ height: 80 + compare.length * 56 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compare} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={14}>
                    <CartesianGrid horizontal={false} stroke={C.grid} strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} stroke={C.grid} /><YAxis type="category" dataKey="name" width={150} tick={{ fill: C.ink, fontSize: 12 }} stroke={C.grid} />
                    <Tooltip cursor={{ fill: "rgba(15,42,42,0.05)" }} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" iconSize={9} wrapperStyle={legendStyle} />
                    <Bar dataKey="compliantApproved" name="ممتثل ومعتمد" stackId="a" fill={C.good} stroke={C.surface} strokeWidth={2} />
                    <Bar dataKey="awaitingReview" name="بانتظار المراجعة" stackId="a" fill={C.warning} stroke={C.surface} strokeWidth={2} />
                    <Bar dataKey="actionRequired" name="يتطلب إجراء" stackId="a" fill={C.critical} stroke={C.surface} strokeWidth={2} />
                    <Bar dataKey="unverified" name="غير متحقق" stackId="a" fill={C.neutral} stroke={C.surface} strokeWidth={2} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>)}
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-[#0c4b45]">عرض الجدول</summary>
              <table className="mt-2 w-full text-right text-xs"><thead className="bg-slate-50"><tr>{["الشركة", "ممتثل ومعتمد", "بانتظار المراجعة", "يتطلب إجراء", "غير متحقق", "الامتثال"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead>
                <tbody>{compare.map((r) => <tr key={r.id} className="border-t"><td className="px-2 py-2">{r.name}</td><td className="px-2 py-2">{r.compliantApproved}</td><td className="px-2 py-2">{r.awaitingReview}</td><td className="px-2 py-2">{r.actionRequired}</td><td className="px-2 py-2">{r.unverified}</td><td className="px-2 py-2">{fmt(pct(r.compliantApproved, r.denominator))}</td></tr>)}</tbody></table></details>
            </div>
          </article>

          <article data-tour="trend-chart">
            <TableTitle icon={TrendingUp} tone="green" title="الاتجاه الأسبوعي" subtitle="من سجلات الدورات الفعلية؛ الدورات بلا مهام تظهر كفراغ لا كصفر" />
            <div className="p-5">
            {trend.every((p) => p.tasks === 0) ? <p className="p-6 text-center text-sm text-slate-500">لا توجد سجلات تاريخية كافية.</p> : (
              <div dir="ltr" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ left: 0, right: 16, top: 8 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} stroke={C.grid} /><YAxis domain={[0, 100]} unit="%" tick={{ fill: C.muted, fontSize: 12 }} stroke={C.grid} />
                    <Tooltip formatter={(v) => (v === null || v === undefined ? "—" : `${v}%`)} contentStyle={tooltipStyle} /><Legend iconType="circle" iconSize={9} wrapperStyle={legendStyle} />
                    <Line type="monotone" dataKey="completion" name="نسبة الإنجاز" stroke={C.blue} strokeWidth={2.5} dot={{ r: 4, fill: C.blue, stroke: C.surface, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                    <Line type="monotone" dataKey="compliance" name="الامتثال المعتمد" stroke={C.teal} strokeWidth={2.5} dot={{ r: 4, fill: C.teal, stroke: C.surface, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>)}
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-[#0c4b45]">عرض الجدول</summary>
              <table className="mt-2 w-full text-right text-xs"><thead className="bg-slate-50"><tr>{["بداية الدورة", "المهام", "الإنجاز", "الامتثال المعتمد"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead>
                <tbody>{trend.map((p) => <tr key={p.cycleId} className="border-t"><td className="px-2 py-2" dir="ltr">{p.label}</td><td className="px-2 py-2">{p.tasks}</td><td className="px-2 py-2">{fmt(p.completion)}</td><td className="px-2 py-2">{fmt(p.compliance)}</td></tr>)}</tbody></table></details>
            </div>
          </article>
        </div>

        {branchRows.length > 0 && (
          <article data-tour="branch-table" className="mb-6">
            <TableTitle icon={Network} tone="amber" title="مقارنة الأقسام — الدورة المختارة" subtitle="الامتثال المعتمد لكل قسم" count={branchRows.length} unit="قسم" />
            <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead className="bg-slate-50"><tr>{["القسم", "الشركة", "المهام", "ممتثل ومعتمد", "يتطلب إجراء", "غير متحقق", "الامتثال المعتمد"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
              <tbody>{branchRows.map((r) => <tr key={r.id} className="border-t"><td className="px-3 py-3">{r.name}</td><td className="px-3 py-3">{r.company}</td><td className="px-3 py-3">{r.total}</td><td className="px-3 py-3">{r.compliantApproved}</td><td className="px-3 py-3">{r.actionRequired}</td><td className="px-3 py-3">{r.unverified}</td><td className="px-3 py-3">{fmt(pct(r.compliantApproved, r.denominator))}</td></tr>)}</tbody></table></div>
          </article>)}
      </>)}
      <div className="border-t" />
    </section>
  );
}
