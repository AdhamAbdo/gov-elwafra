"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { POSES, type PoseName } from "@/lib/avatar-poses";
import { MOBILE_BREAKPOINT, computeLayout, isTallTarget, type Direction, type Rect } from "@/lib/tour-layout";

export type TourStep = {
  id: string;
  /** CSS selector of the element to highlight. Omit for a centred message. Steps whose target is not on the page are skipped. */
  target?: string;
  title: string;
  body: string;
  /** Pose per pointing direction; `none` is used when nothing is highlighted. The avatar points toward the target. */
  poses: Partial<Record<Direction, PoseName>> & { none: PoseName };
};

const HEADER_OFFSET = 88; // sticky header + breathing room
const SPOT_PAD = 8;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sameRect = (a: Rect | null, b: Rect | null) => (a === b) || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

/** Sticky/fixed elements (the sidebar, the header) must not be "scrolled to": scrolling would not move them. */
function isPinned(el: Element): boolean {
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) { const p = getComputedStyle(node).position; if (p === "fixed" || p === "sticky") return true; }
  return false;
}

function scrollTargetIntoView(el: Element) {
  if (isPinned(el)) return;
  const r = el.getBoundingClientRect(); const vh = window.innerHeight; const mobile = window.innerWidth < MOBILE_BREAKPOINT;
  const align = mobile || isTallTarget({ top: r.top, left: r.left, width: r.width, height: r.height }, vh);
  const desiredTop = align ? HEADER_OFFSET : Math.max(HEADER_OFFSET, (vh - r.height) / 2);
  window.scrollBy({ top: r.top - desiredTop, behavior: reduced() ? "auto" : "smooth" });
}

export function GuidedTour({ steps, buttonLabel = "جولة تعريفية" }: { steps: TourStep[]; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ width: 1280, height: 800 });
  const [panelSize, setPanelSize] = useState({ width: 520, height: 260 });
  const [settled, setSettled] = useState(false);
  const [available, setAvailable] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null); const panelRef = useRef<HTMLDivElement>(null); const nextRef = useRef<HTMLButtonElement>(null);

  const step = active[index];
  const mobile = vp.width < MOBILE_BREAKPOINT;

  // Offer the tour only when this page currently shows at least one element the tour explains (e.g. not on an access-denied view).
  useEffect(() => {
    if (open) return;
    const check = () => setAvailable(steps.some((s) => s.target && document.querySelector(s.target)));
    check(); const timer = window.setInterval(check, 800); return () => window.clearInterval(timer);
  }, [open, steps]);

  const start = useCallback(() => {
    // Only steps whose target actually exists right now (e.g. charts are absent until a cycle exists).
    setActive(steps.filter((s) => !s.target || document.querySelector(s.target)));
    setIndex(0); setRect(null); setSettled(false); setOpen(true);
  }, [steps]);
  const close = useCallback(() => { setOpen(false); launcherRef.current?.focus(); }, []);
  const go = useCallback((delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), active.length - 1)), [active.length]);

  // Lock page scrolling by the user (the tour scrolls programmatically) and preload every pose the tour can show.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement; const prev = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    root.style.scrollbarGutter = "stable"; root.style.overflow = "hidden";
    for (const s of active) for (const path of Object.values(s.poses)) { const img = new window.Image(); img.src = POSES[path]; }
    return () => { root.style.overflow = prev.overflow; root.style.scrollbarGutter = prev.gutter; };
  }, [open, active]);

  // On each step: bring the target into view, then follow it every frame (scroll, resize, async content). `settled` gates the panel until the page stops moving.
  useEffect(() => {
    if (!open || !step) return;
    let frame = 0; let last: Rect | null = null; let lastChange = performance.now(); let alive = true;
    const el = step.target ? document.querySelector(step.target) : null;
    if (el) scrollTargetIntoView(el);
    const tick = () => {
      if (!alive) return;
      const node = step.target ? document.querySelector(step.target) : null;
      const b = node?.getBoundingClientRect();
      const next: Rect | null = b ? { top: b.top, left: b.left, width: b.width, height: b.height } : null;
      const size = { width: window.innerWidth, height: window.innerHeight };
      setVp((v) => (v.width === size.width && v.height === size.height ? v : size));
      if (!sameRect(next, last)) { last = next; lastChange = performance.now(); setRect(next); setSettled(false); }
      else if (performance.now() - lastChange > 160) setSettled(true);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [open, step]);

  // Measure the panel so the layout can avoid the target; re-measure when the step text (and so the height) changes.
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current;
    const measure = () => setPanelSize((s) => (Math.abs(s.width - el.offsetWidth) < 1 && Math.abs(s.height - el.offsetHeight) < 1 ? s : { width: el.offsetWidth, height: el.offsetHeight }));
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, [open, index, mobile]);

  // Keyboard: Esc closes; in RTL the Left arrow advances. Tab stays inside the panel. Focus follows the primary button on every step.
  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(-1); }
      else if (e.key === "Tab" && panelRef.current) {
        const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")); if (!f.length) return;
        const first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [open, index, close, go]);

  // Phones get a full-width bottom sheet with a smaller avatar; larger screens a floating avatar + card panel.
  const panelWidth = mobile ? vp.width - 24 : Math.min(540, vp.width - 24);
  const layout = useMemo(() => computeLayout({ target: step?.target ? rect : null, viewport: vp, panel: { width: panelWidth, height: panelSize.height } }), [step, rect, vp, panelWidth, panelSize.height]);
  const poseName = step ? step.poses[layout.direction] ?? step.poses.none : "welcome";
  const spot = layout.focus ? { top: layout.focus.top - SPOT_PAD, left: layout.focus.left - SPOT_PAD, width: layout.focus.width + SPOT_PAD * 2, height: layout.focus.height + SPOT_PAD * 2 } : null;
  const last = index === active.length - 1;
  const avatarFirst = layout.direction !== "left"; // RTL row: first child sits on the right edge, the side that points right/up

  return (
    <>
      {!open && available && (
        <>
          <button ref={launcherRef} type="button" onClick={start} className="tour-launcher" aria-label={buttonLabel} data-tour-launcher>
            <span className="tour-launcher-icon"><Image src={POSES.welcome} alt="" width={96} height={96} unoptimized className="tour-launcher-img" aria-hidden="true" /></span><span className="tour-launcher-label">{buttonLabel}</span>
          </button>
          <div aria-hidden="true" className="h-24 md:h-8" />
        </>
      )}
      {open && step && createPortal(
        <div className="tour-root" dir="rtl">
          <div className="tour-catcher" aria-hidden="true" />
          {spot ? <div className="tour-spot" aria-hidden="true" style={spot} /> : <div className="tour-dim" aria-hidden="true" />}
          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" className={`tour-panel ${mobile ? "tour-panel-mobile" : ""}`} data-ready={settled || !step.target} style={{ top: layout.top, left: layout.left, width: panelWidth }}>
            <div className="tour-avatar" style={{ order: avatarFirst ? 0 : 2 }} data-mobile={mobile} data-first={avatarFirst} aria-hidden="true">
              <Image key={poseName} src={POSES[poseName]} alt="" fill sizes="190px" unoptimized priority className="tour-avatar-img" />
            </div>
            <div className="tour-card" style={{ order: 1 }}>
              <div className="tour-card-top"><span className="tour-counter">الخطوة {index + 1} من {active.length}</span><button type="button" onClick={close} className="tour-x" aria-label="إغلاق الجولة"><X size={16} aria-hidden="true" /></button></div>
              <div aria-live="polite"><h2 id="tour-title" className="tour-title">{step.title}</h2><p id="tour-body" className="tour-body">{step.body}</p></div>
              <div className="tour-progress" aria-hidden="true">{active.map((s, i) => <span key={s.id} className={i === index ? "is-current" : i < index ? "is-done" : ""} />)}</div>
              <div className="tour-actions">
                <button type="button" onClick={() => go(-1)} disabled={index === 0} className="tour-btn tour-btn-ghost"><ChevronRight size={16} aria-hidden="true" />السابق</button>
                {!last && <button type="button" onClick={close} className="tour-link">إنهاء الجولة</button>}
                <button ref={nextRef} type="button" onClick={last ? close : () => go(1)} className="tour-btn tour-btn-primary">{last ? "إنهاء الجولة" : <>التالي<ChevronLeft size={16} aria-hidden="true" /></>}</button>
              </div>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
