const BOM = "﻿";

/** Spreadsheet apps execute cells starting with = + - @ (and tab/CR) as formulas. Prefix such text values so exports cannot carry a formula payload. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = neutralizeFormula(typeof value === "string" ? value : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text with a UTF-8 BOM so Excel opens Arabic correctly. Numbers are written as-is (a leading minus on a number is not a formula). */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T & string; header: string }[]): string {
  const line = (values: string[]) => values.join(",");
  const body = rows.map((r) => line(columns.map((c) => (typeof r[c.key] === "number" ? String(r[c.key]) : cell(r[c.key])))));
  return BOM + [line(columns.map((c) => cell(c.header))), ...body].join("\r\n") + "\r\n";
}

export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const count = (ch: string) => headerLine.split(ch).length - 1;
  const best = ([",", ";", "\t"] as const).reduce((a, b) => (count(b) > count(a) ? b : a));
  return best;
}

/** RFC-4180 style parser: quoted fields, escaped quotes, CRLF/LF, BOM, auto-detected `,` `;` or tab delimiter. Blank lines are skipped. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.some((v) => v.trim() !== "")) rows.push(row); row = []; }
    else field += ch;
  }
  if (quoted) throw new Error("ملف CSV غير صالح: حقل بين علامتي اقتباس لم يُغلق.");
  row.push(field); if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}
