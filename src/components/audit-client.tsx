"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { ExportButton } from "@/components/export-button";
import { toCsv } from "@/lib/csv";
import { Field, TableTitle, SkeletonRows } from "@/components/ui";
import { actionLabel, auditDetailRows, entityLabel, entityOptions } from "@/lib/audit-format";

const PAGE = 50;
const rowSchema = z.object({
  id: z.string().uuid(), actor_id: z.string().uuid().nullable(), action: z.string(), entity_type: z.string(), entity_id: z.string().uuid().nullable(),
  company_id: z.string().uuid().nullable(), before_value: z.unknown(), after_value: z.unknown(), created_at: z.string(),
});
type Row = z.infer<typeof rowSchema>;
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });
const profileSchema = z.object({ id: z.string().uuid(), display_name: z.string() });

export default function AuditClient() {
  const [rows, setRows] = useState<Row[]>([]); const [companies, setCompanies] = useState<z.infer<typeof companySchema>[]>([]); const [people, setPeople] = useState<Map<string, string>>(new Map()); const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map()); const [lookupWarning, setLookupWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [limit, setLimit] = useState(PAGE);
  const [company, setCompany] = useState(""); const [entity, setEntity] = useState(""); const [action, setAction] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    let q = supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,company_id,before_value,after_value,created_at").order("created_at", { ascending: false }).limit(limit);
    if (company) q = q.eq("company_id", company);
    if (entity) q = q.eq("entity_type", entity);
    if (action.trim()) q = q.ilike("action", `%${action.trim().replace(/[%_,]/g, "")}%`);
    if (from) q = q.gte("created_at", new Date(`${from}T00:00:00+03:00`).toISOString());
    if (to) q = q.lte("created_at", new Date(`${to}T23:59:59.999+03:00`).toISOString());
    const [a, c, p, br, em, li, ct, it, ca] = await Promise.all([q, supabase.from("companies").select("id,name_ar").order("name_ar"), supabase.from("user_profiles").select("id,display_name"),
      supabase.from("branches").select("id,name_ar"), supabase.from("employees").select("id,full_name"), supabase.from("licenses").select("id,license_type,license_number"),
      supabase.from("contracts").select("id,contract_identifier"), supabase.from("compliance_items").select("id,name"), supabase.from("corrective_actions").select("id,title")]);
    const failure = a.error ?? c.error ?? p.error;
    if (failure) { setError(`تعذر تحميل سجل التدقيق: ${failure.message}`); setLoading(false); return; }
    const pa = z.array(rowSchema).safeParse(a.data), pc = z.array(companySchema).safeParse(c.data), pp = z.array(profileSchema).safeParse(p.data);
    if (!pa.success || !pc.success || !pp.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    const lookups = [br, em, li, ct, it, ca]; const bad = lookups.find((l) => l.error);
    const map = new Map<string, string>(); const add = (rows: { id: string }[] | null, label: (r: never) => string) => { for (const r of rows ?? []) map.set(r.id, label(r as never)); };
    add(br.data as { id: string; name_ar: string }[] | null, (r: { name_ar: string }) => r.name_ar); add(em.data as { id: string; full_name: string }[] | null, (r: { full_name: string }) => r.full_name);
    add(li.data as { id: string; license_type: string; license_number: string }[] | null, (r: { license_type: string; license_number: string }) => `${r.license_type} (${r.license_number})`);
    add(ct.data as { id: string; contract_identifier: string }[] | null, (r: { contract_identifier: string }) => r.contract_identifier); add(it.data as { id: string; name: string }[] | null, (r: { name: string }) => r.name); add(ca.data as { id: string; title: string }[] | null, (r: { title: string }) => r.title);
    for (const c of pc.data) map.set(c.id, c.name_ar); for (const x of pp.data) map.set(x.id, x.display_name);
    setNames(map); setLookupWarning(bad?.error ? `تعذر تحميل بعض الأسماء المرجعية (${bad.error.message}); تُعرض المعرفات المختصرة بدلاً منها.` : null);
    setRows(pa.data); setCompanies(pc.data); setPeople(new Map(pp.data.map((x) => [x.id, x.display_name]))); setLoading(false);
  }, [limit, company, entity, action, from, to]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const companyName = new Map(companies.map((c) => [c.id, c.name_ar]));
  const hasDetail = (v: unknown) => v !== null && v !== undefined && !(typeof v === "object" && Object.keys(v as object).length === 0);

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 flex justify-between gap-3">
        <div data-tour="page-title"><p className="text-sm text-slate-500">الرئيسية / سجل التدقيق</p><h1 className="text-2xl font-bold">سجل التدقيق</h1></div>
        <div className="flex items-start gap-3"><ExportButton label="تصدير CSV" filename="audit-log" kind="audit_logs" companyId={company || null} build={() => {
          const data = rows.map((r) => ({ time: new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }), actor: r.actor_id ? people.get(r.actor_id) ?? r.actor_id : "النظام", action: actionLabel(r.action) ?? r.action, entity: `${entityLabel(r.entity_type)}${r.entity_id ? ` — ${names.get(r.entity_id) ?? r.entity_id}` : ""}`, company: r.company_id ? companyName.get(r.company_id) ?? "" : "", details: auditDetailRows(r.before_value, r.after_value, names).map((d) => `${d.field}: ${d.before !== null ? `${d.before} ← ` : ""}${d.after ?? ""}`).join(" | ") }));
          return { count: data.length, csv: toCsv(data, [{ key: "time", header: "الوقت (الرياض)" }, { key: "actor", header: "المنفِّذ" }, { key: "action", header: "الإجراء" }, { key: "entity", header: "السجل" }, { key: "company", header: "الشركة" }, { key: "details", header: "التفاصيل" }]) };
        }} /><button onClick={() => void load()} aria-label="تحديث"><RefreshCw className={loading ? "animate-spin" : ""} size={19} /></button></div>
      </div>
      <p data-tour="audit-note" className="mb-4 border border-slate-200 bg-white p-3 text-sm text-slate-600">سجل للقراءة فقط متاح لمديري الشركات والإدارة العامة ومسؤولي النظام ضمن شركاتهم. لا يمكن تعديل السجلات أو حذفها.</p>
      {lookupWarning && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{lookupWarning}</p>}
      {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div data-tour="filters" className="mb-4 grid gap-3 md:grid-cols-5">
        <Field label="الشركة"><select value={company} onChange={(e) => { setLimit(PAGE); setCompany(e.target.value); }}><option value="">الكل</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="نوع السجل"><select value={entity} onChange={(e) => { setLimit(PAGE); setEntity(e.target.value); }}><option value="">الكل</option>{entityOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="الإجراء يحتوي"><input dir="ltr" placeholder="created, review_…" value={action} onChange={(e) => { setLimit(PAGE); setAction(e.target.value); }} /></Field>
        <Field label="من تاريخ"><input type="date" value={from} onChange={(e) => { setLimit(PAGE); setFrom(e.target.value); }} /></Field>
        <Field label="إلى تاريخ"><input type="date" value={to} onChange={(e) => { setLimit(PAGE); setTo(e.target.value); }} /></Field>
      </div>
      <article data-tour="audit-table" className="overflow-hidden border bg-white">
        <TableTitle icon={ScrollText} tone="blue" title="الأحداث" subtitle="سجل أحداث النظام، لا يمكن تعديله أو حذفه" count={rows.length} unit="حدث معروض" />
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm">
          <thead className="bg-slate-50"><tr>{["الوقت (الرياض)", "المنفِّذ", "الإجراء", "السجل", "الشركة", "التفاصيل"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={6} />}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">لا توجد أحداث مطابقة ضمن صلاحياتك.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-3" dir="ltr">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}</td>
                <td className="px-3 py-3">{r.actor_id ? people.get(r.actor_id) ?? `${r.actor_id.slice(0, 8)}…` : "النظام"}</td>
                <td className="px-3 py-3">{actionLabel(r.action) ?? r.action}<small className="block text-slate-400" dir="ltr">{r.action}</small></td>
                <td className="px-3 py-3">{entityLabel(r.entity_type)}{r.entity_id && <small className="block text-slate-500" title={r.entity_id}>{names.get(r.entity_id) ?? `…${r.entity_id.slice(-8)}`}</small>}</td>
                <td className="px-3 py-3">{r.company_id ? companyName.get(r.company_id) ?? "—" : "—"}</td>
                <td className="px-3 py-3">{hasDetail(r.before_value) || hasDetail(r.after_value) ? <Details before={r.before_value} after={r.after_value} names={names} /> : "—"}</td>
              </tr>))}
          </tbody></table></div>
        {rows.length >= limit && <footer className="border-t p-3 text-center"><button onClick={() => setLimit(limit + PAGE)} className="border px-4 py-1.5 text-sm">عرض المزيد</button></footer>}
      </article>
    </div>
  );
}

function Details({ before, after, names }: { before: unknown; after: unknown; names: ReadonlyMap<string, string> }) {
  const rows = auditDetailRows(before, after, names);
  const both = rows.some((r) => r.before !== null) && rows.some((r) => r.after !== null);
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[#0c4b45]">عرض التفاصيل</summary>
      <table className="mt-2 min-w-[260px] text-right text-xs">
        <thead><tr><th>الحقل</th>{both ? <><th>قبل</th><th>بعد</th></> : <th>القيمة</th>}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.field}><td className="font-medium text-slate-600">{row.field}</td>{both ? <><td>{row.before ?? "—"}</td><td>{row.after ?? "—"}</td></> : <td>{row.after ?? row.before}</td>}</tr>)}</tbody>
      </table>
    </details>
  );
}
