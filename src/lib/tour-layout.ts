// Pure layout rules for the guided tour: where the tooltip panel (avatar + card) goes so it never covers the highlighted element,
// and which way the avatar must point. Kept free of DOM access so it can be unit tested.

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
/** Which way the avatar points: toward the target. "up" = target above the panel, "none" = no target (welcome / finish). */
export type Direction = "left" | "right" | "up" | "none";
export type Placement = "left" | "right" | "below" | "above" | "center" | "docked";
export type Layout = { placement: Placement; top: number; left: number; direction: Direction; /** the part of the target to spotlight (clipped when the panel is docked over a tall target) */ focus: Rect | null };

export const MOBILE_BREAKPOINT = 768;
const EDGE = 12;
const GAP = 18;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const bottom = (r: Rect) => r.top + r.height;
const right = (r: Rect) => r.left + r.width;

/** `panel` is the measured size of the avatar+card panel; on narrow screens it is expected to already be viewport-wide. */
export function computeLayout(input: { target: Rect | null; viewport: Size; panel: Size }): Layout {
  const { target, viewport: vp, panel } = input;
  const dockTop = vp.height - panel.height - EDGE;
  const dockLeft = clamp((vp.width - panel.width) / 2, EDGE, vp.width - panel.width - EDGE);

  if (!target) return { placement: "center", top: clamp((vp.height - panel.height) / 2, EDGE, vp.height - panel.height - EDGE), left: dockLeft, direction: "none", focus: null };

  // Docked bottom sheet: phones, and any target too big to leave room beside it. The spotlight is clipped so it never hides under the panel.
  const docked = (): Layout => ({ placement: "docked", top: dockTop, left: dockLeft, direction: "up", focus: { ...target, height: Math.max(40, Math.min(target.height, dockTop - GAP - target.top)) } });
  if (vp.width < MOBILE_BREAKPOINT) return docked();

  const fitsVertically = (t: number) => t >= EDGE && t + panel.height <= vp.height - EDGE;
  const midTop = clamp(target.top + target.height / 2 - panel.height / 2, EDGE, vp.height - panel.height - EDGE);
  const midLeft = clamp(target.left + target.width / 2 - panel.width / 2, EDGE, vp.width - panel.width - EDGE);

  // Preference: beside a narrow target (sidebar, buttons), otherwise below, then above.
  const spaceLeft = target.left - EDGE, spaceRight = vp.width - right(target) - EDGE;
  const spaceBelow = vp.height - bottom(target) - EDGE, spaceAbove = target.top - EDGE;
  if (spaceLeft >= panel.width + GAP && fitsVertically(midTop)) return { placement: "left", top: midTop, left: target.left - GAP - panel.width, direction: "right", focus: target };
  if (spaceRight >= panel.width + GAP && fitsVertically(midTop)) return { placement: "right", top: midTop, left: right(target) + GAP, direction: "left", focus: target };
  if (spaceBelow >= panel.height + GAP) return { placement: "below", top: bottom(target) + GAP, left: midLeft, direction: "up", focus: target };
  if (spaceAbove >= panel.height + GAP) {
    const panelCenter = midLeft + panel.width / 2;
    return { placement: "above", top: target.top - GAP - panel.height, left: midLeft, direction: target.left + target.width / 2 >= panelCenter ? "right" : "left", focus: target };
  }
  return docked();
}

/** True when a target is too tall to centre in the viewport with room for the panel, so the tour should align its top edge instead. */
export const isTallTarget = (target: Rect, viewportHeight: number) => target.height > viewportHeight * 0.55;
