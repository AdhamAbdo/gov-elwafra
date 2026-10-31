import { supabase } from "@/lib/supabase-browser";

type Result = { ok: true } | { ok: false; error: string };

async function authHeader(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
}
const NO_SESSION: Result = { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد." };

/** Signed links keyed by company id. A failure returns an empty map: cards fall back to the placeholder icon. */
export async function fetchCompanyLogos(): Promise<Record<string, string>> {
  const headers = await authHeader(); if (!headers) return {};
  const res = await fetch("/api/companies/logo", { headers }).catch(() => null);
  const body = res?.ok ? ((await res.json().catch(() => null)) as { logos?: Record<string, string> } | null) : null;
  return body?.logos ?? {};
}

async function finish(res: Response | null, fallback: string): Promise<Result> {
  if (!res) return { ok: false, error: "تعذر الاتصال بالخادم." };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return res.ok ? { ok: true } : { ok: false, error: body?.error ?? fallback };
}

export async function uploadCompanyLogo(companyId: string, file: File): Promise<Result> {
  const headers = await authHeader(); if (!headers) return NO_SESSION;
  const form = new FormData(); form.set("companyId", companyId); form.set("file", file);
  return finish(await fetch("/api/companies/logo", { method: "POST", headers, body: form }).catch(() => null), "تعذر رفع الشعار.");
}

export async function removeCompanyLogo(companyId: string): Promise<Result> {
  const headers = await authHeader(); if (!headers) return NO_SESSION;
  return finish(await fetch("/api/companies/logo", { method: "DELETE", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) }).catch(() => null), "تعذر حذف الشعار.");
}
