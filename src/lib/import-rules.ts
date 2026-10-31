// Pure import logic: column mapping, per-row validation and duplicate detection. The database function repeats the same checks,
// so the preview is a convenience and never the only gate.

export type ImportEntity = "licenses" | "employees";
export type FieldDef = { key: string; label: string; required: boolean; aliases: string[] };
export const MAX_IMPORT_ROWS = 1000;

export const FIELDS: Record<ImportEntity, FieldDef[]> = {
  licenses: [
    { key: "license_type", label: "نوع الترخيص", required: true, aliases: ["license_type", "type", "نوع الترخيص", "النوع"] },
    { key: "authority", label: "الجهة المصدرة", required: true, aliases: ["authority", "issuing_authority", "الجهة", "الجهة المصدرة"] },
    { key: "license_number", label: "رقم الترخيص", required: true, aliases: ["license_number", "number", "رقم الترخيص", "الرقم"] },
    { key: "issue_date", label: "تاريخ الإصدار", required: false, aliases: ["issue_date", "issued", "تاريخ الإصدار"] },
    { key: "expiry_date", label: "تاريخ الانتهاء", required: true, aliases: ["expiry_date", "expires", "expiry", "تاريخ الانتهاء"] },
    { key: "branch", label: "القسم", required: false, aliases: ["branch", "branch_name", "department", "department_name", "القسم", "الفرع"] },
    { key: "notes", label: "ملاحظات", required: false, aliases: ["notes", "ملاحظات"] },
  ],
  employees: [
    { key: "employee_code", label: "الرمز الوظيفي", required: true, aliases: ["employee_code", "code", "الرمز الوظيفي", "الرمز"] },
    { key: "full_name", label: "الاسم", required: true, aliases: ["full_name", "name", "الاسم", "اسم الموظف"] },
    { key: "job_title", label: "المسمى الوظيفي", required: false, aliases: ["job_title", "title", "المسمى الوظيفي", "المسمى"] },
    { key: "start_date", label: "تاريخ المباشرة", required: false, aliases: ["start_date", "تاريخ المباشرة"] },
    { key: "branch", label: "القسم", required: false, aliases: ["branch", "branch_name", "department", "department_name", "القسم", "الفرع"] },
  ],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Best-effort automatic mapping: field key -> index of the matching header (or -1). Each header is used at most once. */
export function autoMap(entity: ImportEntity, headers: string[]): Record<string, number> {
  const used = new Set<number>(); const map: Record<string, number> = {};
  for (const f of FIELDS[entity]) {
    const idx = headers.findIndex((h, i) => !used.has(i) && f.aliases.some((a) => norm(a) === norm(h)));
    map[f.key] = idx; if (idx >= 0) used.add(idx);
  }
  return map;
}

/** Accepts YYYY-MM-DD or DD/MM/YYYY (also - or . separators); returns ISO date or null when missing/invalid (including impossible dates like 31/02). */
export function parseDate(raw: string): string | null {
  const v = raw.trim(); let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; } else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) { d = +hit[1]; m = +hit[2]; y = +hit[3]; } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type ParsedRow = { line: number; values: Record<string, string>; errors: string[]; duplicate: string | null };
export type ExistingKeys = { licenses: Set<string>; employeeCodes: Set<string>; branches: Set<string> };
export const licenseKey = (number: string, expiry: string) => `${norm(number)}|${expiry}`;

export function buildRows(entity: ImportEntity, table: string[][], map: Record<string, number>, existing: ExistingKeys): ParsedRow[] {
  const seen = new Set<string>();
  return table.map((cells, i): ParsedRow => {
    const values: Record<string, string> = {}; const errors: string[] = [];
    for (const f of FIELDS[entity]) { const idx = map[f.key]; values[f.key] = idx >= 0 ? (cells[idx] ?? "").trim() : ""; if (f.required && !values[f.key]) errors.push(`${f.label} مطلوب`); }
    for (const dateKey of ["issue_date", "expiry_date", "start_date"]) {
      if (!(dateKey in values) || !values[dateKey]) continue;
      const iso = parseDate(values[dateKey]);
      if (!iso) errors.push(`${FIELDS[entity].find((f) => f.key === dateKey)?.label}: تاريخ غير صالح (استخدم YYYY-MM-DD أو DD/MM/YYYY)`); else values[dateKey] = iso;
    }
    if (values.branch && !existing.branches.has(norm(values.branch))) errors.push(`القسم «${values.branch}» غير موجود في الشركة المختارة`);
    if (entity === "licenses" && values.issue_date && values.expiry_date && /^\d{4}-/.test(values.issue_date) && /^\d{4}-/.test(values.expiry_date) && values.expiry_date < values.issue_date) errors.push("تاريخ الانتهاء يسبق تاريخ الإصدار");
    let duplicate: string | null = null;
    if (!errors.length) {
      const key = entity === "licenses" ? licenseKey(values.license_number, values.expiry_date) : norm(values.employee_code);
      if (seen.has(key)) duplicate = "مكرر داخل الملف"; else if (entity === "licenses" ? existing.licenses.has(key) : existing.employeeCodes.has(key)) duplicate = "موجود مسبقاً في النظام (لن يُستبدل)";
      seen.add(key);
    }
    return { line: i + 2, values, errors, duplicate };
  });
}

export function summarize(rows: ParsedRow[]) {
  const invalid = rows.filter((r) => r.errors.length).length; const duplicates = rows.filter((r) => !r.errors.length && r.duplicate).length;
  return { total: rows.length, invalid, duplicates, importable: rows.length - invalid - duplicates };
}
