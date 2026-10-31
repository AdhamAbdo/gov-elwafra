// Profile-picture validation, shared by the browser (fast feedback) and the server route (authoritative: the bytes decide).

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type AvatarExtension = keyof typeof TYPES;
export const AVATAR_ACCEPT = Object.values(TYPES).join(",");

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Detects the real image type from the leading bytes; the file name and declared type are never trusted. */
export function detectAvatarType(b: Uint8Array): AvatarExtension | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

export type AvatarCheck = { ok: true; extension: AvatarExtension; mime: string } | { ok: false; error: string };

export function validateAvatar(bytes: Uint8Array): AvatarCheck {
  if (bytes.length === 0) return { ok: false, error: "الملف فارغ." };
  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, error: "حجم الصورة يتجاوز 2 ميغابايت." };
  const extension = detectAvatarType(bytes);
  if (!extension) return { ok: false, error: "الصورة يجب أن تكون بصيغة PNG أو JPG أو WebP." };
  return { ok: true, extension, mime: TYPES[extension] };
}
