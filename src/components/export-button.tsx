"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";

/**
 * Exports exactly the rows the page is showing, which the database already limited to what the user may read (RLS).
 * The export is recorded in the audit log BEFORE the file is produced; if recording fails, nothing is downloaded.
 */
export function ExportButton({ label, filename, kind, companyId, build }: { label: string; filename: string; kind: "licenses" | "employees" | "contracts" | "audit_logs"; companyId?: string | null; build(): { csv: string; count: number } }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMessage(null);
    const { csv, count } = build();
    if (count === 0) { setMessage("لا توجد بيانات للتصدير."); setBusy(false); return; }
    const { error } = await supabase.rpc("log_export", { kind, row_count: count, target_company: companyId ?? null });
    if (error) { setMessage(`تعذر تسجيل التصدير: ${error.message}`); setBusy(false); return; }
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setMessage(`تم تصدير ${count} سجل.`); setBusy(false);
  }
  return <span data-tour="export" className="inline-flex items-center gap-2"><button type="button" disabled={busy} onClick={() => void run()} className="btn-secondary"><Download size={17} aria-hidden="true" />{label}</button>{message && <small role="status" className="text-slate-500">{message}</small>}</span>;
}
