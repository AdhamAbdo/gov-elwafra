"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Settings2, UserCog, UserCheck, UserPlus, UserX, X } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { useAccess } from "@/components/app-shell";
import { Badge, Field, IconButton, SearchBox, TableTitle, Toolbar, SkeletonRows } from "@/components/ui";
import ScrollToForm from "@/components/scroll-to-form";
import { ROLES, type RoleName } from "@/lib/admin-schemas";

const userSchema = z.object({
  id: z.string().uuid(), email: z.string().nullable(), displayName: z.string().nullable(), hasProfile: z.boolean(), active: z.boolean(), lastSignInAt: z.string().nullable(),
  roles: z.array(z.object({ companyId: z.string().uuid(), role: z.enum(ROLES) })), branchIds: z.array(z.string().uuid()),
});
type User = z.infer<typeof userSchema>;
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });
const branchSchema = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name_ar: z.string() });
type Company = z.infer<typeof companySchema>; type Branch = z.infer<typeof branchSchema>;
const roleText: Record<RoleName, string> = { system_administrator: "مسؤول النظام", general_manager: "المدير العام", company_manager: "مدير شركة", compliance_officer: "مسؤول امتثال", read_only: "اطلاع فقط" };
type Panel = { kind: "invite" } | { kind: "manage"; user: User } | { kind: "deactivate"; user: User };

async function adminPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "انتهت الجلسة، سجّل الدخول مجدداً." };
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: "تعذر الاتصال بالخادم." };
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: (json as { error?: string } | null)?.error ?? `فشل الطلب (${res.status}).` };
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "استجابة غير متوقعة من الخادم." };
}

export default function UsersClient() {
  const access = useAccess();
  const [users, setUsers] = useState<User[]>([]); const [companies, setCompanies] = useState<Company[]>([]); const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [companyFilter, setCompanyFilter] = useState(""); const [panel, setPanel] = useState<Panel | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [list, c, b] = await Promise.all([adminPost("/api/admin/users/list", {}, z.object({ users: z.array(userSchema) })), supabase.from("companies").select("id,name_ar").order("name_ar"), supabase.from("branches").select("id,company_id,name_ar").order("name_ar")]);
    if (!list.ok) { setError(list.error); setLoading(false); return; }
    const failure = c.error ?? b.error; if (failure) { setError(`تعذر تحميل الشركات: ${failure.message}`); setLoading(false); return; }
    const pc = z.array(companySchema).safeParse(c.data), pb = z.array(branchSchema).safeParse(b.data);
    if (!pc.success || !pb.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    setUsers(list.data.users); setCompanies(pc.data); setBranches(pb.data); setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const companyName = new Map(companies.map((c) => [c.id, c.name_ar]));
  const mine = companies.filter((c) => access.adminOf.includes(c.id));
  const visible = users.filter((u) => (!companyFilter || u.roles.some((r) => r.companyId === companyFilter)) && (!search || [u.displayName ?? "", u.email ?? ""].some((v) => v.toLowerCase().includes(search.toLowerCase()))));
  const done = (message: string) => { setPanel(null); setNotice(message); void load(); };

  if (access.userId && access.adminOf.length === 0) return <div className="p-8"><p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">هذه الصفحة متاحة لمسؤولي النظام فقط.</p></div>;

  return (
    <div className="p-5 md:p-8">
      <div data-tour="page-title" className="mb-6"><p className="text-sm text-slate-500">الرئيسية / المستخدمون والصلاحيات</p><h1 className="text-2xl font-bold">المستخدمون والصلاحيات</h1></div>
      <Toolbar actions={<><IconButton icon={RefreshCw} label="تحديث" onClick={() => void load()} /><button type="button" data-tour="invite-user" onClick={() => { setInviteLink(null); setPanel({ kind: "invite" }); }} className="btn-primary"><UserPlus size={17} aria-hidden="true" />دعوة مستخدم</button></>}>
        <SearchBox value={search} onChange={setSearch} placeholder="الاسم أو البريد" />
        <Field label="الشركة"><select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}><option value="">كل الشركات</option>{mine.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
      </Toolbar>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {panel?.kind === "invite" && <ScrollToForm dep={panel}><InviteForm companies={mine} inviteLink={inviteLink} onLink={(l) => { setInviteLink(l); void load(); }} fail={setError} close={() => { setPanel(null); setInviteLink(null); }} /></ScrollToForm>}
      {panel?.kind === "manage" && <ScrollToForm dep={panel}><ManagePanel user={panel.user} self={panel.user.id === access.userId} companies={mine} branches={branches} fail={setError} done={done} close={() => setPanel(null)} /></ScrollToForm>}
      {panel?.kind === "deactivate" && <ScrollToForm dep={panel}><DeactivateForm user={panel.user} fail={setError} done={done} close={() => setPanel(null)} /></ScrollToForm>}

      <article data-tour="user-table">
        <TableTitle icon={UserCog} tone="blue" title="المستخدمون" subtitle="الحسابات والأدوار وحالة كل مستخدم" count={`${visible.length} من ${users.length}`} unit="مستخدم" />
        <div className="overflow-x-auto"><table className="min-w-[800px] text-right text-sm">
          <thead><tr>{["المستخدم", "الحالة", "الأدوار", "آخر دخول", "إجراءات"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={5} />}
            {!loading && visible.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500">{users.length === 0 ? "لا يوجد مستخدمون ضمن شركاتك. ادعُ أول مستخدم من زر «دعوة مستخدم»." : "لا توجد نتائج مطابقة."}</td></tr>}
            {visible.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName ?? "—"}{u.id === access.userId && <span className="mr-2 text-xs text-slate-500">(أنت)</span>}<small className="block text-slate-500" dir="ltr">{u.email ?? "—"}</small></td>
                <td>{!u.hasProfile ? <Badge tone="amber">بلا ملف</Badge> : u.active ? <Badge tone="green">نشط</Badge> : <Badge tone="gray">معطّل</Badge>}</td>
                <td><div className="flex flex-wrap gap-1.5">{u.roles.length === 0 ? <span className="text-slate-400">لا أدوار</span> : u.roles.map((r) => <Badge key={`${r.companyId}:${r.role}`} tone={r.role === "system_administrator" ? "red" : r.role === "read_only" ? "gray" : "blue"}>{`${roleText[r.role]} — ${companyName.get(r.companyId) ?? "—"}`}</Badge>)}</div></td>
                <td dir="ltr">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "لم يسجل الدخول"}</td>
                <td><div className="flex gap-2">
                  <IconButton icon={Settings2} tone="blue" label="إدارة الأدوار والأقسام" onClick={() => setPanel({ kind: "manage", user: u })} />
                  {u.id !== access.userId && u.hasProfile && (u.active ? <IconButton icon={UserX} tone="red" label="تعطيل المستخدم" onClick={() => setPanel({ kind: "deactivate", user: u })} /> : <IconButton icon={UserCheck} tone="green" label="إعادة تفعيل" onClick={() => void adminPost("/api/admin/users/active", { userId: u.id, active: true }, z.object({ ok: z.boolean() })).then((r) => (r.ok ? done("تمت إعادة تفعيل المستخدم.") : setError(r.error)))} />)}
                </div></td>
              </tr>))}
          </tbody></table></div>
      </article>
      <p data-tour="user-note" className="mt-3 text-xs text-slate-500">لا يمكنك تعديل أدوارك أو حالتك بنفسك، ولا يمكن إزالة أو تعطيل آخر مسؤول نظام في شركة. يُنشأ المستخدم بدعوة برابط يختار منه كلمة مروره بنفسه؛ لا تُخزَّن كلمات المرور في أي مكان من النظام.</p>
    </div>
  );
}

function InviteForm({ companies, inviteLink, onLink, fail, close }: { companies: Company[]; inviteLink: string | null; onLink(link: string): void; fail(v: string): void; close(): void }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [company, setCompany] = useState(""); const [role, setRole] = useState<RoleName>("compliance_officer"); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const r = await adminPost("/api/admin/users/create", { email, displayName: name, companyId: company, role }, z.object({ userId: z.string().uuid(), inviteLink: z.string().url() }));
    setBusy(false);
    if (!r.ok) { fail(`تعذرت الدعوة: ${r.error}`); return; }
    onLink(r.data.inviteLink);
  }
  if (inviteLink) return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="mb-2 font-bold">تم إنشاء الدعوة</h2>
      <p className="mb-3 text-sm text-amber-900">سلّم هذا الرابط للمستخدم بطريقة آمنة (مباشرة أو برسالة خاصة). هو رابط لمرة واحدة، ولن يظهر مرة أخرى بعد إغلاق هذه النافذة، وكل من يملكه يستطيع تعيين كلمة المرور.</p>
      <input readOnly dir="ltr" value={inviteLink} onFocus={(e) => e.target.select()} className="w-full" />
      <div className="mt-3 flex gap-3"><button type="button" onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => setCopied(true))} className="btn-secondary"><Copy size={16} aria-hidden="true" />{copied ? "تم النسخ" : "نسخ الرابط"}</button><button type="button" onClick={close} className="btn-primary">تم</button></div>
    </div>
  );
  return (
    <form onSubmit={submit} className="mb-5 border bg-white p-5">
      <button type="button" onClick={close} className="float-left">إلغاء</button><h2 className="mb-3 font-bold">دعوة مستخدم جديد</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="البريد الإلكتروني"><input required type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="الاسم المعروض"><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="الشركة"><select required value={company} onChange={(e) => setCompany(e.target.value)}><option value="">اختر</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="الدور"><select value={role} onChange={(e) => setRole(e.target.value as RoleName)}>{ROLES.map((r) => <option key={r} value={r}>{roleText[r]}</option>)}</select></Field>
      </div>
      <button disabled={busy} className="btn-primary mt-4">{busy ? "جارٍ الإنشاء…" : "إنشاء الدعوة"}</button>
    </form>
  );
}

function ManagePanel({ user, self, companies, branches, fail, done, close }: { user: User; self: boolean; companies: Company[]; branches: Branch[]; fail(v: string): void; done(m: string): void; close(): void }) {
  const [company, setCompany] = useState(""); const [role, setRole] = useState<RoleName>("compliance_officer"); const [branch, setBranch] = useState(""); const [confirming, setConfirming] = useState<string | null>(null);
  const companyName = new Map(companies.map((c) => [c.id, c.name_ar])); const branchName = new Map(branches.map((b) => [b.id, `${b.name_ar}`]));
  const run = async (promise: PromiseLike<{ error: { message: string } | null }>, label: string, ok: string) => { const { error } = await promise; if (error) { fail(`${label}: ${error.message}`); return; } done(ok); };
  const myBranchIds = user.branchIds.filter((id) => branchName.has(id));
  const rolesInCompany = new Set(user.roles.map((r) => r.companyId));
  return (
    <div className="mb-5 border bg-white p-5" style={{ borderRadius: 14 }}>
      <button type="button" onClick={close} className="float-left">إغلاق</button><h2 className="mb-1 font-bold">إدارة: {user.displayName ?? user.email}</h2>
      {self && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">لا يمكنك تعديل أدوارك بنفسك؛ اطلب ذلك من مسؤول نظام آخر.</p>}
      <h3 className="mb-2 mt-3 text-sm font-bold text-slate-600">الأدوار</h3>
      <div className="mb-3 flex flex-wrap gap-2">{user.roles.length === 0 && <span className="text-sm text-slate-500">لا أدوار</span>}{user.roles.map((r) => { const key = `${r.companyId}:${r.role}`; return (
        <span key={key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-sm">{roleText[r.role]} — {companyName.get(r.companyId) ?? "—"}
          {!self && (confirming === key ? <button type="button" onClick={() => void run(supabase.rpc("remove_company_role", { target: user.id, target_company: r.companyId, old_role: r.role }), "تعذرت الإزالة", "تمت إزالة الدور.")} className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">تأكيد الإزالة</button> : <button type="button" aria-label="إزالة الدور" onClick={() => setConfirming(key)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-slate-200"><X size={14} /></button>)}
        </span>); })}</div>
      {!self && <div className="grid gap-3 md:grid-cols-4">
        <Field label="الشركة"><select value={company} onChange={(e) => setCompany(e.target.value)}><option value="">اختر</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
        <Field label="الدور"><select value={role} onChange={(e) => setRole(e.target.value as RoleName)}>{ROLES.map((r) => <option key={r} value={r}>{roleText[r]}</option>)}</select></Field>
        <div className="flex items-end"><button type="button" disabled={!company} onClick={() => void run(supabase.rpc("assign_company_role", { target: user.id, target_company: company, new_role: role }), "تعذر منح الدور", "تم منح الدور.")} className="btn-secondary">إضافة دور</button></div>
      </div>}
      <h3 className="mb-2 mt-5 text-sm font-bold text-slate-600">الوصول إلى الأقسام <small className="font-normal text-slate-500">(للمستخدم المقيّد بأقسام محددة)</small></h3>
      <div className="mb-3 flex flex-wrap gap-2">{myBranchIds.length === 0 && <span className="text-sm text-slate-500">لا قيود أقسام (يصل لكل أقسام شركاته حسب دوره)</span>}{myBranchIds.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-sm">{branchName.get(id)}<button type="button" aria-label="إزالة القسم" onClick={() => void run(supabase.rpc("remove_branch_access", { target: user.id, target_branch: id }), "تعذرت الإزالة", "تمت إزالة الوصول إلى القسم.")} className="grid h-6 w-6 place-items-center rounded-full hover:bg-slate-200"><X size={14} /></button></span>))}</div>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="قسم"><select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">اختر</option>{branches.filter((b) => rolesInCompany.has(b.company_id) && !user.branchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}</select></Field>
        <div className="flex items-end"><button type="button" disabled={!branch} onClick={() => void run(supabase.rpc("assign_branch_access", { target: user.id, target_branch: branch }), "تعذر منح الوصول", "تم منح الوصول إلى القسم.")} className="btn-secondary">إضافة قسم</button></div>
      </div>
    </div>
  );
}

function DeactivateForm({ user, fail, done, close }: { user: User; fail(v: string): void; done(m: string): void; close(): void }) {
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!reason.trim()) { fail("سبب التعطيل مطلوب."); return; }
    setBusy(true); const r = await adminPost("/api/admin/users/active", { userId: user.id, active: false, reason }, z.object({ ok: z.boolean() })); setBusy(false);
    if (!r.ok) { fail(`تعذر التعطيل: ${r.error}`); return; }
    done("تم تعطيل المستخدم ومنعه من الدخول.");
  }
  return <form onSubmit={submit} className="mb-5 border bg-white p-5"><button type="button" onClick={close} className="float-left">إلغاء</button><h2 className="mb-3 font-bold">تعطيل {user.displayName ?? user.email}</h2><Field label="سبب التعطيل (مطلوب)"><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field><p className="mt-2 text-xs text-slate-500">يُمنع المستخدم من الدخول ولا يرى أي بيانات. سجلاته التاريخية تبقى محفوظة، ويمكن إعادة تفعيله لاحقاً.</p><button disabled={busy} className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-white">تأكيد التعطيل</button></form>;
}
