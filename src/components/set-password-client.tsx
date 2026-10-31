"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { Field } from "@/components/ui";
import { newPasswordError } from "@/lib/admin-schemas";

/** Landing page for invitation and password-reset links: Supabase signs the user in from the link, then they choose their own password. */
export default function SetPasswordClient() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    let settled = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (session) { settled = true; setState((s) => (s === "done" ? s : "ready")); } });
    void supabase.auth.getSession().then(({ data: { session } }) => { if (session) { settled = true; setState("ready"); } });
    const timer = setTimeout(() => { if (!settled) setState("invalid"); }, 4000);
    return () => { clearTimeout(timer); data.subscription.unsubscribe(); };
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const problem = newPasswordError(password, confirm);
    if (problem) { setError(problem); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) { setError(`تعذر حفظ كلمة المرور: ${updateError.message}`); return; }
    setState("done");
    setTimeout(() => { router.push("/"); }, 1200);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#103b38] p-5" dir="rtl">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0c4b45] text-white"><KeyRound size={22} /></span><h1 className="text-lg font-bold">تعيين كلمة المرور</h1></div>
        {state === "checking" && <p className="text-sm text-slate-500">جارٍ التحقق من الرابط…</p>}
        {state === "invalid" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">الرابط غير صالح أو منتهي الصلاحية. اطلب من مسؤول النظام دعوة جديدة، أو استخدم «نسيت كلمة المرور» من صفحة الدخول.</p>}
        {state === "done" && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">تم حفظ كلمة المرور. جارٍ تحويلك…</p>}
        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <Field label="كلمة المرور الجديدة"><input required type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="تأكيد كلمة المرور"><input required type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            <p className="text-xs text-slate-500">10 أحرف على الأقل، وتحتوي على أحرف وأرقام.</p>
            <button disabled={busy} className="btn-primary w-full justify-center">حفظ ومتابعة</button>
          </form>
        )}
      </div>
    </main>
  );
}
