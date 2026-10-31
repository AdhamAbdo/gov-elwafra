"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Brings an add/edit form into view when it opens (or switches to another record) and puts the cursor in its first field. */
export default function ScrollToForm({ dep, children }: { dep?: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    // preventScroll: the smooth scroll above is the only movement; focusing must not jump the page first.
    el.querySelector<HTMLElement>("input:not([type=hidden]):not([type=checkbox]):not([disabled]), select, textarea")?.focus({ preventScroll: true });
  }, [dep]);
  // scroll-mt clears the 64px sticky header.
  return <div ref={ref} className="scroll-mt-24">{children}</div>;
}
