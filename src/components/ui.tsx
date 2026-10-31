import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">{label}</span><span className="block [&_input]:w-full [&_select]:w-full [&_textarea]:w-full">{children}</span></label>;
}

export type Tone = "green" | "amber" | "red" | "blue" | "gray";
/** Soft status chip. Meaning is carried by the text, never by colour alone. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

/** Title bar of a table card: coloured icon chip with the title and subtitle beside it, plain record count at the far end. Renders the card's <header>. */
export function TableTitle({ icon: Icon, tone = "blue", title, subtitle, count, unit = "سجل", children }: { icon: LucideIcon; tone?: Tone; title: string; subtitle?: string; count?: number | string; unit?: string; children?: ReactNode }) {
  return (
    <header className="table-title" data-hue={tone}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="icon-chip"><Icon size={20} aria-hidden="true" /></div>
        <div className="min-w-0"><b className="table-title-main block text-base leading-tight">{title}</b>{subtitle && <small className="table-title-sub mt-0.5 block text-xs">{subtitle}</small>}</div>
      </div>
      <div className="flex items-center gap-3">{children}{count !== undefined && <div className="table-title-count text-sm"><b>{count}</b> {unit}</div>}</div>
    </header>
  );
}

type IconButtonProps = { icon: LucideIcon; label: string; onClick(): void; tone?: Tone | "primary" };
/** Compact colour-coded action with a hover/focus tooltip; the label is also the accessible name. */
export function IconButton({ icon: Icon, label, onClick, tone = "gray" }: IconButtonProps) {
  return <button type="button" onClick={onClick} aria-label={label} data-tip={label} className={`icon-btn ${tone === "gray" ? "" : `icon-btn-${tone}`}`}><Icon size={17} aria-hidden="true" /></button>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  return <label className="search-box block text-sm" data-tour="search"><span className="mb-1 block font-medium text-slate-600">بحث</span><span className="relative block"><Search size={17} aria-hidden="true" /><input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></span></label>;
}

/** One cohesive bar for search, filters and the page's primary actions. */
export function Toolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="toolbar" role="search" data-tour="toolbar">{children}<span className="toolbar-spacer" />{actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}</div>;
}

/** Shimmering placeholder rows for a table body while its data is loading. */
export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>{Array.from({ length: rows }, (_, r) => (
      <tr key={r} aria-hidden={r > 0 ? "true" : undefined}>
        {Array.from({ length: cols }, (_, c) => (
          <td key={c}><span className="skeleton" style={{ width: `${c === 0 ? 72 : 40 + ((r * 7 + c * 13) % 45)}%` }} />{r === 0 && c === 0 && <span role="status" className="sr-only">جارٍ التحميل…</span>}</td>
        ))}
      </tr>
    ))}</>
  );
}

/** Placeholder KPI cards (icon tile, label bar, big number bar) shown before the first data arrives. */
export function SkeletonCards({ count }: { count: number }) {
  return (
    <>{Array.from({ length: count }, (_, i) => (
      <div key={i} className="skeleton-card" aria-hidden={i > 0 ? "true" : undefined}>
        <div className="flex items-center gap-3"><span className="skeleton skeleton-tile" /><span className="skeleton" style={{ width: "55%" }} /></div>
        <span className="skeleton" style={{ width: "38%", height: 28 }} />
        {i === 0 && <span role="status" className="sr-only">جارٍ التحميل…</span>}
      </div>
    ))}</>
  );
}

/** Centred spinner with a label, for areas that have no table or card shape to imitate. */
export function LoadingBlock({ label = "جارٍ التحميل…", compact = false }: { label?: string; compact?: boolean }) {
  return <div role="status" className={`flex flex-col items-center justify-center gap-3 text-sm text-slate-500 ${compact ? "p-4" : "p-10"}`}><span className={`spinner ${compact ? "spinner-sm" : ""}`} aria-hidden="true" />{label}</div>;
}
