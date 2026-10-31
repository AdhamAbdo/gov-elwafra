// Server-side upload validation. The browser's file type and extension are untrusted hints; the CONTENT decides.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
} as const;
export type AllowedExtension = keyof typeof TYPES;
export const ALLOWED_EXTENSIONS = Object.keys(TYPES) as AllowedExtension[];

/** Strips directories, control and bidi-override characters (spoofed names like "invoice‮fdp.exe"), and bounds the length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(-150) || "file";
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
const latin1 = (b: Uint8Array, len: number) => Array.from(b.subarray(0, len), (c) => String.fromCharCode(c)).join("");

function contentMatches(ext: AllowedExtension, b: Uint8Array): boolean {
  switch (ext) {
    case "pdf": return startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "png": return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg": case "jpeg": return startsWith(b, [0xff, 0xd8, 0xff]);
    case "docx": case "xlsx": { // OOXML = a ZIP whose first entries include [Content_Types].xml and the part folder for that format
      if (!startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return false;
      const head = latin1(b, 65536);
      return head.includes("[Content_Types].xml") && head.includes(ext === "docx" ? "word/" : "xl/");
    }
    case "csv": { // text only: no NUL bytes, and valid UTF-8
      if (b.subarray(0, 8192).includes(0)) return false;
      try { new TextDecoder("utf-8", { fatal: true }).decode(b); return true; } catch { return false; }
    }
  }
}

export type UploadCheck = { ok: true; extension: AllowedExtension; mime: string; safeName: string } | { ok: false; error: string };

export function validateUpload(input: { name: string; size: number; bytes: Uint8Array }): UploadCheck {
  const safeName = sanitizeFileName(input.name);
  if (input.size <= 0 || input.bytes.length === 0) return { ok: false, error: "الملف فارغ." };
  if (input.size > MAX_UPLOAD_BYTES || input.bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "حجم الملف يتجاوز 10 ميغابايت." };
  const ext = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
  if (!(ext in TYPES)) return { ok: false, error: `نوع الملف غير مسموح. المسموح: ${ALLOWED_EXTENSIONS.join(", ")}.` };
  const extension = ext as AllowedExtension;
  if (!contentMatches(extension, input.bytes)) return { ok: false, error: "محتوى الملف لا يطابق امتداده، فلن يُقبل." };
  return { ok: true, extension, mime: TYPES[extension], safeName };
}
