"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, KeyRound, Mail, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase-browser";
import { Field, LoadingBlock } from "@/components/ui";
import { newPasswordError } from "@/lib/admin-schemas";
import { AVATAR_ACCEPT, MAX_AVATAR_BYTES, validateAvatar } from "@/lib/avatar-validation";
import { fetchAvatarUrl, removeAvatar, uploadAvatar } from "@/lib/avatar-client";

const ROLE_TEXT: Record<string, string> = { system_administrator: "مسؤول النظام", general_manager: "المدير العام", company_manager: "مدير شركة", compliance_officer: "مسؤول امتثال", read_only: "اطلاع فقط" };
const roleSchema = z.object({ company_id: z.string().uuid().nullable(), role: z.string() });
const companySchema = z.object({ id: z.string().uuid(), name_ar: z.string() });

export default function ProfileClient() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(""); const [savedName, setSavedName] = useState(""); const [name, setName] = useState("");
  const [roles, setRoles] = useState<{ company: string; role: string }[]>([]);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null); const [pwNotice, setPwNotice] = useState<string | null>(null); const [pwBusy, setPwBusy] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); const [avatarBusy, setAvatarBusy] = useState(false); const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: who } = await supabase.auth.getUser();
    const user = who.user;
    if (!user) { setError("تعذر تحديد المستخدم الحالي."); setLoading(false); return; }
    const [own, held, companies] = await Promise.all([
      supabase.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("user_company_roles").select("company_id,role").eq("user_id", user.id),
      supabase.from("companies").select("id,name_ar"),
    ]);
    const failure = own.error ?? held.error ?? companies.error;
    if (failure) { setError(`تعذر تحميل الملف الشخصي: ${failure.message}`); setLoading(false); return; }
    const pr = z.array(roleSchema).safeParse(held.data), pc = z.array(companySchema).safeParse(companies.data);
    if (!pr.success || !pc.success) { setError("تم استلام بنية بيانات غير متوقعة من قاعدة البيانات."); setLoading(false); return; }
    const names = new Map(pc.data.map((c) => [c.id, c.name_ar]));
    const display = own.data?.display_name ?? "";
    setEmail(user.email ?? ""); setSavedName(display); setName(display);
    setRoles(pr.data.map((r) => ({ company: (r.company_id && names.get(r.company_id)) || "—", role: ROLE_TEXT[r.role] ?? r.role })));
    setAvatarUrl(await fetchAvatarUrl());
    setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function pickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    // Same check the server repeats on the real bytes; this only saves a round trip.
    if (file.size > MAX_AVATAR_BYTES) { setAvatarError("حجم الصورة يتجاوز 2 ميغابايت."); return; }
    const checked = validateAvatar(new Uint8Array(await file.arrayBuffer()));
    if (!checked.ok) { setAvatarError(checked.error); return; }
    setAvatarBusy(true);
    const result = await uploadAvatar(file);
    if (!result.ok) { setAvatarBusy(false); setAvatarError(result.error); return; }
    setAvatarUrl(await fetchAvatarUrl()); setAvatarBusy(false);
    window.dispatchEvent(new Event("profile-changed"));
  }
  async function dropAvatar() {
    setAvatarError(null); setAvatarBusy(true);
    const result = await removeAvatar();
    setAvatarBusy(false);
    if (!result.ok) { setAvatarError(result.error); return; }
    setAvatarUrl(null); window.dispatchEvent(new Event("profile-changed"));
  }

  async function saveName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setNotice(null);
    const cleaned = name.trim();
    if (cleaned.length < 2 || cleaned.length > 120) { setError("الاسم يجب أن يكون بين 2 و120 حرفاً."); return; }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("update_own_profile", { new_display_name: cleaned });
    setBusy(false);
    if (rpcError) { setError(`تعذر حفظ الاسم: ${rpcError.message}`); return; }
    setSavedName(cleaned); setName(cleaned); setNotice("تم حفظ الاسم.");
    window.dispatchEvent(new Event("profile-changed"));
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPwError(null); setPwNotice(null);
    if (!current) { setPwError("أدخل كلمة المرور الحالية."); return; }
    const problem = newPasswordError(password, confirm);
    if (problem) { setPwError(problem); return; }
    setPwBusy(true);
    // Re-check the current password so a borrowed, still-signed-in session cannot silently take over the account.
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) { setPwBusy(false); setPwError("كلمة المرور الحالية غير صحيحة."); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (updateError) { setPwError(`تعذر تغيير كلمة المرور: ${updateError.message}`); return; }
    setCurrent(""); setPassword(""); setConfirm(""); setPwNotice("تم تغيير كلمة المرور.");
  }

  const initials = savedName.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] ?? "").join("") || "؟";
  const dirty = name.trim() !== savedName;

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6"><p className="text-sm text-slate-500">الرئيسية / الملف الشخصي</p><h1 className="text-2xl font-bold">الملف الشخصي</h1></div>
      {loading ? <LoadingBlock /> : (
        <div className="max-w-5xl space-y-6">
          <section className="flex flex-wrap items-center gap-5 rounded-[14px] bg-gradient-to-br from-[#0c4b45] to-[#0f766e] p-6 text-white shadow-[0_10px_28px_rgb(12_75_69/0.28)]">
            <div className="relative shrink-0">
              <span className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-[#5eead4] bg-white/15 text-3xl font-bold shadow-[0_0_0_5px_rgb(94_234_212/0.16)]">
                {avatarUrl ? <Image src={avatarUrl} alt="الصورة الشخصية" width={192} height={192} unoptimized className="h-full w-full object-cover" /> : initials}
              </span>
              <button type="button" disabled={avatarBusy} onClick={() => fileInput.current?.click()} aria-label="تغيير الصورة" data-tip="تغيير الصورة" className="icon-btn icon-btn-primary absolute -bottom-1 -left-1 border-2 border-white"><Camera size={16} aria-hidden="true" /></button>
              <input ref={fileInput} type="file" accept={AVATAR_ACCEPT} onChange={(e) => void pickAvatar(e)} className="hidden" aria-hidden="true" tabIndex={-1} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold">{savedName || "مستخدم"}</h2>
              <p className="mt-0.5 flex items-center gap-2 text-sm text-teal-100"><Mail size={15} aria-hidden="true" /><span dir="ltr">{email}</span></p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-teal-100">
                {avatarBusy ? "جارٍ المعالجة…" : "PNG أو JPG أو WebP، حتى 2 ميغابايت."}
                {avatarUrl && !avatarBusy && <button type="button" onClick={() => void dropAvatar()} className="inline-flex items-center gap-1 underline"><Trash2 size={13} aria-hidden="true" />حذف الصورة</button>}
              </p>
              {avatarError && <p role="alert" className="mt-2 inline-block rounded-lg bg-red-50 px-3 py-1 text-xs text-red-800">{avatarError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {roles.length === 0 ? <span className="rounded-full bg-white/15 px-3 py-0.5 text-xs">لا توجد أدوار مسندة</span> : roles.map((r, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium"><ShieldCheck size={13} aria-hidden="true" />{r.role} — {r.company}</span>)}
              </div>
            </div>
          </section>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <article>
              <header className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center !rounded-lg !p-0 bg-[#e0efff] text-[#1d4ed8]"><UserRound size={17} aria-hidden="true" /></span><b>البيانات الأساسية</b></header>
              <form onSubmit={saveName} className="space-y-4 p-6" noValidate>
                <Field label="الاسم المعروض"><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="البريد الإلكتروني"><input value={email} readOnly disabled dir="ltr" /></Field>
                <p className="text-xs text-slate-500">البريد والصلاحيات يديرها مسؤول النظام.</p>
                <button disabled={busy || !dirty} className="btn-primary"><Save size={17} aria-hidden="true" />حفظ التغييرات</button>
              </form>
            </article>

            <article>
              <header className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center !rounded-lg !p-0 bg-[#fef3c7] text-[#92400e]"><KeyRound size={17} aria-hidden="true" /></span><b>تغيير كلمة المرور</b></header>
              <form onSubmit={changePassword} className="space-y-4 p-6" noValidate>
                {pwError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{pwError}</p>}
                {pwNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{pwNotice}</p>}
                <Field label="كلمة المرور الحالية"><input required type="password" autoComplete="current-password" dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
                <Field label="كلمة المرور الجديدة"><input required type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
                <Field label="تأكيد كلمة المرور الجديدة"><input required type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
                <p className="text-xs text-slate-500">10 أحرف على الأقل، وتحتوي على أحرف وأرقام.</p>
                <button disabled={pwBusy} className="btn-primary"><KeyRound size={17} aria-hidden="true" />تغيير كلمة المرور</button>
              </form>
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
