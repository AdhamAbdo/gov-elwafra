"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Building2, ChevronDown, FileBadge, Landmark, LayoutDashboard, LogOut, ScrollText, ShieldCheck, UserCog, UserRound, Users, Upload } from "lucide-react";
import Image from "next/image";
import { supabase } from "@/lib/supabase-browser";
import { fetchAvatarUrl } from "@/lib/avatar-client";
import { playNotificationSound, unlockNotificationSound } from "@/lib/notification-sound";
import { Field } from "@/components/ui";

type Access = { userId: string | null; managerOf: string[]; officerOf: string[]; adminOf: string[] };
const NO_ACCESS: Access = { userId: null, managerOf: [], officerOf: [], adminOf: [] };
const AccessContext = createContext<Access>(NO_ACCESS);
/** Role hints for showing controls. Authorization is always enforced again by the database. */
export const useAccess = () => useContext(AccessContext);

const MANAGER_ROLES = ["company_manager", "general_manager", "system_administrator"];
// Highest first: used only to label the signed-in user in the header.
const ROLE_LABELS: [string, string][] = [["system_administrator", "مسؤول النظام"], ["general_manager", "المدير العام"], ["company_manager", "مدير شركة"], ["compliance_officer", "مسؤول امتثال"], ["read_only", "اطلاع فقط"]];
const NAV = [
  { href: "/", label: "لوحة المتابعة", icon: LayoutDashboard },
  { href: "/licenses", label: "التراخيص", icon: FileBadge },
  { href: "/companies", label: "الشركات والأقسام", icon: Building2 },
  { href: "/employees", label: "الموظفون والعقود", icon: Users },
  { href: "/verifications", label: "المنصات الحكومية", icon: Landmark },
  { href: "/audit", label: "سجل التدقيق", icon: ScrollText, managerOnly: true },
  { href: "/import", label: "استيراد البيانات", icon: Upload, managerOnly: true },
  { href: "/users", label: "المستخدمون والصلاحيات", icon: UserCog, adminOnly: true },
] satisfies { href: string; label: string; icon: typeof Users; managerOnly?: boolean; adminOnly?: boolean }[];

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => [...p][0] ?? "").join("") || "؟";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<"loading" | "out" | "in">("loading");
  const [access, setAccess] = useState<Access>(NO_ACCESS);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ name: string; role: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [loginError, setLoginError] = useState<string | null>(null); const [loginNotice, setLoginNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setMode(data.session ? "in" : "out"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setMode(session ? "in" : "out"));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (mode !== "in") return;
    let cancelled = false;
    void Promise.all([supabase.auth.getUser(), supabase.from("user_company_roles").select("company_id,role")]).then(async ([who, roles]) => {
      if (cancelled) return;
      if (roles.error) { setAccessError(`تعذر تحميل الصلاحيات: ${roles.error.message}`); return; }
      setAccessError(null);
      const userId = who.data.user?.id ?? null; const held = (roles.data ?? []).map((r) => r.role);
      setAccess({
        userId,
        managerOf: (roles.data ?? []).filter((r) => MANAGER_ROLES.includes(r.role)).map((r) => r.company_id),
        adminOf: (roles.data ?? []).filter((r) => r.role === "system_administrator").map((r) => r.company_id),
        officerOf: (roles.data ?? []).filter((r) => r.role === "compliance_officer" || MANAGER_ROLES.includes(r.role)).map((r) => r.company_id),
      });
      const own = userId ? await supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle() : null;
      if (cancelled) return;
      setProfile({ name: own?.data?.display_name ?? who.data.user?.email ?? "مستخدم", role: ROLE_LABELS.find(([key]) => held.includes(key))?.[1] ?? "—" });
    });
    return () => { cancelled = true; };
  }, [mode]);

  const [unread, setUnread] = useState(0); const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "in") return;
    let cancelled = false;
    const refresh = () => void supabase.from("notifications").select("id", { count: "exact", head: true }).eq("in_app", true).is("read_at", null).lte("scheduled_at", new Date().toISOString()).then(({ count, error }) => {
      if (cancelled) return;
      if (error) { console.warn("unread notification count unavailable:", error.message); setUnread(0); return; }
      const next = count ?? 0;
      if (lastUnread.current !== null && next > lastUnread.current) playNotificationSound();
      lastUnread.current = next;
      setUnread(next);
    });
    refresh(); window.addEventListener("notifications-changed", refresh);
    const poll = window.setInterval(refresh, 60_000); const unlock = unlockNotificationSound();
    return () => { cancelled = true; window.removeEventListener("notifications-changed", refresh); window.clearInterval(poll); unlock(); };
  }, [mode, pathname]);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== "in") return;
    let cancelled = false;
    const refreshAvatar = () => void fetchAvatarUrl().then((url) => { if (!cancelled) setAvatarUrl(url); });
    refreshAvatar(); window.addEventListener("profile-changed", refreshAvatar);
    return () => { cancelled = true; window.removeEventListener("profile-changed", refreshAvatar); };
  }, [mode]);

  useEffect(() => {
    if (mode !== "in") return;
    const refreshName = () => void supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id; if (!id) return;
      void supabase.from("user_profiles").select("display_name").eq("id", id).maybeSingle().then(({ data: own }) => { if (own?.display_name) setProfile((p) => (p ? { ...p, name: own.display_name } : p)); });
    });
    window.addEventListener("profile-changed", refreshName);
    return () => window.removeEventListener("profile-changed", refreshName);
  }, [mode]);

  const value = useMemo(() => access, [access]);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoginError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError(`تعذر تسجيل الدخول: ${error.message}`);
  }
  async function forgotPassword() {
    setLoginError(null); setLoginNotice(null);
    if (!email.trim()) { setLoginError("أدخل بريدك الإلكتروني أولاً ثم اضغط «نسيت كلمة المرور»."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/set-password` });
    // The same neutral message is shown whether or not the address is registered, so accounts cannot be probed.
    if (error && error.status !== 400) { setLoginError(`تعذر إرسال الرابط: ${error.message}`); return; }
    setLoginNotice("إذا كان البريد مسجلاً لدينا فسيصلك رابط لتعيين كلمة مرور جديدة.");
  }
  async function logout() { setMenuOpen(false); await supabase.auth.signOut(); setAccess(NO_ACCESS); setProfile(null); setAvatarUrl(null); }

  if (mode !== "in") {
    return <main className="grid min-h-screen place-items-center bg-[#103b38] p-5" dir="rtl"><form onSubmit={login} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-2xl"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0c4b45] text-white"><ShieldCheck size={22} /></span><h1 className="text-lg font-bold">نظام الحوكمة والامتثال</h1></div>{loginError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{loginError}</p>}{loginNotice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{loginNotice}</p>}<Field label="البريد الإلكتروني"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></Field><Field label="كلمة المرور"><input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" /></Field><button disabled={mode === "loading"} className="btn-primary w-full justify-center">تسجيل الدخول</button><button type="button" onClick={() => void forgotPassword()} className="w-full text-sm text-[#0c4b45] underline">نسيت كلمة المرور؟</button></form></main>;
  }

  return (
    <AccessContext.Provider value={value}>
      <div className="min-h-screen text-[#0f2a2a]" dir="rtl">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between bg-white px-6 shadow-[0_1px_0_#e8edf2,0_4px_16px_rgb(15_42_42/0.04)]">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0c4b45] text-white"><ShieldCheck size={21} /></span><div><b className="block leading-tight">نظام الحوكمة والامتثال</b><span className="text-xs text-slate-500">Governance & Compliance</span></div></div>
          <div className="flex items-center gap-2">
            <Link data-tour="bell" href="/notifications" aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ""}`} data-tip="الإشعارات" className="icon-btn icon-btn-ghost relative"><Bell size={20} />{unread > 0 && <span className="absolute -top-0.5 -left-0.5 grid min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}</Link>
            <div className="relative">
              <button type="button" data-tour="user-menu" onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                <span className="relative grid h-10 w-10 place-items-center rounded-full bg-[#0c4b45] text-sm font-bold text-white">{avatarUrl ? <Image src={avatarUrl} alt="" width={80} height={80} unoptimized className="h-10 w-10 rounded-full object-cover" /> : profile ? initials(profile.name) : "…"}<span title="متصل" className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" /></span>
                <span className="hidden text-right sm:block"><b className="block text-sm leading-tight">{profile?.name ?? "…"}</b><span className="text-xs text-slate-500">{profile?.role ?? ""}</span></span>
                <ChevronDown size={16} className="text-slate-400" aria-hidden="true" />
              </button>
              {menuOpen && <>
                <button type="button" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 cursor-default bg-transparent" />
                <div role="menu" className="absolute left-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl bg-white p-1.5 shadow-[0_8px_28px_rgb(15_42_42/0.16)]">
                  <div className="border-b border-slate-100 px-3 py-2"><b className="block text-sm">{profile?.name}</b><span className="text-xs text-slate-500">{profile?.role}</span></div>
                  <Link role="menuitem" href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50"><UserRound size={16} />الملف الشخصي</Link>
                  <Link role="menuitem" href="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50"><Bell size={16} />الإشعارات{unread > 0 && <span className="mr-auto rounded-full bg-red-100 px-2 text-xs text-red-700">{unread}</span>}</Link>
                  <button role="menuitem" type="button" onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-700 hover:bg-red-50"><LogOut size={16} />تسجيل الخروج</button>
                </div>
              </>}
            </div>
          </div>
        </header>
        <div className="flex flex-col lg:flex-row">
          <nav data-tour="sidebar" aria-label="التنقل الرئيسي" className="flex gap-1 overflow-x-auto bg-[#103b38] p-3 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-64 lg:shrink-0 lg:flex-col lg:p-4">
            {NAV.filter((n) => (!("managerOnly" in n) || access.managerOf.length > 0) && (!("adminOnly" in n) || access.adminOf.length > 0)).map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return <Link key={href} href={href} aria-current={active ? "page" : undefined} className="nav-link"><Icon size={19} aria-hidden="true" />{label}</Link>;
            })}
          </nav>
          <main className="min-w-0 flex-1">
            {accessError && <p role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{accessError}</p>}
            {children}
          </main>
        </div>
      </div>
    </AccessContext.Provider>
  );
}
