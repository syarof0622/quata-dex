import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Compact metric card — denser typography on mobile, scales on md+. */
export function MobileMetricCard({
  label, value, sub, tone, icon, title,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "bull" | "bear" | "warn";
  icon?: ReactNode;
  title?: string;
}) {
  const valCls =
    tone === "bull" ? "text-bull"
    : tone === "bear" ? "text-bear"
    : tone === "warn" ? "text-amber-400"
    : "";
  return (
    <div className="panel p-3 md:p-4" title={title}>
      <div className="text-[10.5px] md:text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("font-mono mt-1 text-[17px] md:text-xl leading-tight", valCls)}>
        {value}
      </div>
      {sub && (
        <div className="text-[10.5px] md:text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
          {sub}
        </div>
      )}
    </div>
  );
}

/** Elegant empty state — never a giant blank card. */
export function MobileEmptyState({
  icon, title, hint,
}: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-6 px-3 gap-1.5">
      {icon && <div className="text-muted-foreground opacity-70">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-[11.5px] text-muted-foreground max-w-[28ch]">{hint}</div>}
    </div>
  );
}

/** Skeleton rows for list loading states. */
export function MobileSkeletonRows({ rows = 3, height = 18 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton w-full" style={{ height }} />
      ))}
    </div>
  );
}

/** Section header for mobile pages. */
export function MobilePageHeader({
  title, subtitle, right, icon,
}: { title: string; subtitle?: string; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-2">
      <div className="min-w-0">
        <h1 className="hero-h1 text-2xl md:text-2xl font-semibold flex items-center gap-2 truncate">
          {icon}{title}
        </h1>
        {subtitle && <p className="text-[12.5px] md:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
