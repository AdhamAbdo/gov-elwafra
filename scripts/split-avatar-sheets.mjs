// One-off asset preparation: splits avatar/1.png, 2.png, 3.png (3x2 grids of poses on transparent backgrounds)
// into individual transparent PNGs in public/avatar/pose-<sheet>-<n>.png, cropped to each pose's opaque pixels.
// Uses `sharp`, which is installed transitively by Next.js; it is intentionally NOT a declared dependency of this project.
// Usage: node scripts/split-avatar-sheets.mjs
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const ALPHA = 24; // pixels at or below this alpha count as background
const PAD = 6;
await mkdir("public/avatar", { recursive: true });

/** Consecutive runs of indices where `filled[i]` is true; runs closer than `minGap` are merged (stray anti-aliasing pixels). */
function runs(filled, minGap) {
  const out = [];
  for (let i = 0; i < filled.length; i++) {
    if (!filled[i]) continue;
    const last = out[out.length - 1];
    if (last && i - last[1] <= minGap) last[1] = i; else out.push([i, i]);
  }
  return out;
}

for (const sheet of [1, 2, 3]) {
  const { data, info } = await sharp(`avatar/${sheet}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info; const a = (x, y) => data[(y * W + x) * 4 + 3];
  const rowFilled = Array.from({ length: H }, (_, y) => { for (let x = 0; x < W; x++) if (a(x, y) > ALPHA) return true; return false; });
  const bands = runs(rowFilled, 4);
  if (bands.length !== 2) throw new Error(`sheet ${sheet}: expected 2 pose rows, found ${bands.length}`);
  let n = 0;
  for (const [y0, y1] of bands) {
    const colFilled = Array.from({ length: W }, (_, x) => { for (let y = y0; y <= y1; y++) if (a(x, y) > ALPHA) return true; return false; });
    // Neighbouring poses can almost touch (a raised hand next to the next head): tighten the merge gap until exactly 3 separate.
    let cols = [];
    for (const gap of [6, 4, 2, 1, 0]) { cols = runs(colFilled, gap); if (cols.length === 3) break; }
    if (cols.length !== 3) throw new Error(`sheet ${sheet}: expected 3 poses in a row, found ${cols.length}`);
    for (const [x0, x1] of cols) {
      n++;
      const left = Math.max(0, x0 - PAD), top = Math.max(0, y0 - PAD);
      const width = Math.min(W, x1 + PAD + 1) - left, height = Math.min(H, y1 + PAD + 1) - top;
      const file = `public/avatar/pose-${sheet}-${n}.png`;
      await sharp(`avatar/${sheet}.png`).extract({ left, top, width, height }).png().toFile(file);
      console.log(`${file}  ${width}x${height}`);
    }
  }
}
