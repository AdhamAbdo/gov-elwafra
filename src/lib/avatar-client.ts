import { supabase } from "@/lib/supabase-browser";

async function authHeader(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
}

/** Signed link to the signed-in user's picture, or null (none set, or the request failed: callers fall back to initials). */
export async function fetchAvatarUrl(): Promise<string | null> {
  const headers = await authHeader(); if (!headers) return null;
  const res = await fetch("/api/profile/avatar", { headers }).catch(() => null);
  const body = res?.ok ? ((await res.json().catch(() => null)) as { url?: string | null } | null) : null;
  return typeof body?.url === "string" ? body.url : null;
}

export async function uploadAvatar(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeader(); if (!headers) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد." };
  const form = new FormData(); form.set("file", file);
  const res = await fetch("/api/profile/avatar", { method: "POST", headers, body: form }).catch(() => null);
  if (!res) return { ok: false, error: "تعذر الاتصال بالخادم." };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return res.ok ? { ok: true } : { ok: false, error: body?.error ?? "تعذر رفع الصورة." };
}

export async function removeAvatar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeader(); if (!headers) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد." };
  const res = await fetch("/api/profile/avatar", { method: "DELETE", headers }).catch(() => null);
  if (!res) return { ok: false, error: "تعذر الاتصال بالخادم." };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return res.ok ? { ok: true } : { ok: false, error: body?.error ?? "تعذر حذف الصورة." };
}
