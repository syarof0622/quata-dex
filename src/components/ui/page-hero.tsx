import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeroProps = {
  /** Small chip rendered above the title (e.g. "Paper Trading Only"). */
  eyebrow?: ReactNode;
  /** Optional lucide icon component. */
  icon?: React.ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned controls / buttons. */
  actions?: ReactNode;
  /** Show the live pulsing dot in the eyebrow chip. */
  live?: boolean;
  className?: string;
};

/**
 * Premium page header used across every authenticated page.
 * Provides a consistent "command-center" feel that matches the landing page:
 *  - subtle glass panel with thin border
 *  - localized radial primary glow behind the title
 *  - eyebrow chip + large gradient title + secondary subtitle
 *  - right-aligned actions slot for filters / buttons / toggles
 */
export function PageHero({
  eyebrow,
  icon: Icon,
  title,
  subtitle,
  actions,
  live,
  className,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/80 bg-[color-mix(in_oklab,var(--surface-1)_72%,transparent)] backdrop-blur-md",
        "px-4 py-4 md:px-6 md:py-5",
        className,
      )}
    >
      {/* Local glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-10 h-64 w-[60%] opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--primary) 22%, transparent) 0%, transparent 70%)",
          filter: "blur(18px)",
        }}
      />
      {/* Hairline highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 55%, transparent), transparent)",
        }}
      />

      <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
        <div className="min-w-0 flex-1">
          {(eyebrow || live) && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/40 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              {live && <span className="pulse-dot" style={{ width: 6, height: 6 }} />}
              {eyebrow}
            </div>
          )}
          <h1 className="hero-h1 flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-[28px]">
            {Icon && (
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary neon-border">
                <Icon className="size-4" />
              </span>
            )}
            <span className="anim-shimmer-text">{title}</span>
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground md:text-sm">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}

export default PageHero;
