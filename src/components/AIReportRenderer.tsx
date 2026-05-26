import { useMemo } from "react";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  ShieldAlert,
  BarChart3,
  Target,
  Database,
  Info,
  Activity,
  CircleDot,
} from "lucide-react";

/* =========================================================================
   AI Report Renderer
   --------------------------------------------------------------------------
   Parses a streaming AI markdown response and turns recognised sections
   into structured analyst-report UI blocks:
     ## Market Summary       -> SummaryCard
     ## Top Picks            -> Picks table + mobile stack of StockCards
     ## Detailed Analysis    -> Per-ticker AnalysisCard list (### TICKER)
     ## Risk & Mitigation    -> Amber/rose AlertCard
     ## Action Plan          -> Numbered playbook card
     ## Data Sources         -> DataFreshness chip card
     > Disclaimer            -> Muted footnote
   Unknown sections fall back to ChatMarkdown.
   Robust to streaming partials and malformed pipe tables.
   ========================================================================= */

const ACTION_TONES: Record<string, { badge: string; dot: string; row: string }> = {
  "STRONG BUY":   { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", row: "border-l-emerald-500/60" },
  "BUY":          { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", row: "border-l-emerald-500/60" },
  "ACCUMULATE":   { badge: "bg-teal-500/15 text-teal-400 border-teal-500/30",          dot: "bg-teal-400",    row: "border-l-teal-500/60" },
  "TACTICAL BUY": { badge: "bg-teal-500/15 text-teal-400 border-teal-500/30",          dot: "bg-teal-400",    row: "border-l-teal-500/60" },
  "WATCH":        { badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",       dot: "bg-amber-400",   row: "border-l-amber-500/60" },
  "HOLD":         { badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",       dot: "bg-slate-400",   row: "border-l-slate-500/60" },
  "AVOID":        { badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",          dot: "bg-rose-400",    row: "border-l-rose-500/60" },
  "SELL":         { badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",          dot: "bg-rose-400",    row: "border-l-rose-500/60" },
  "HIGH RISK":    { badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",          dot: "bg-rose-400",    row: "border-l-rose-500/60" },
};

function ActionBadge({ value }: { value: string }) {
  const v = value.trim().toUpperCase();
  const tone = ACTION_TONES[v];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone?.badge ?? "bg-muted/40 text-muted-foreground border-border/60"
      )}
    >
      {tone?.dot && <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />}
      {v || "—"}
    </span>
  );
}

/* ---------- Section model ---------- */

type SectionKind =
  | "summary"
  | "top-picks"
  | "detailed"
  | "risk"
  | "action"
  | "data"
  | "disclaimer"
  | "generic";

type Section = { kind: SectionKind; title: string; body: string };

function classifySection(title: string): SectionKind {
  const t = title.toLowerCase();
  if (/market\s+summary|ringkasan|overview/.test(t)) return "summary";
  if (/top\s+picks|rekomendasi|stock\s+picks|saham\s+pilihan/.test(t)) return "top-picks";
  if (/detailed\s+analysis|analisis\s+detail|per[-\s]?ticker/.test(t)) return "detailed";
  if (/risk|risiko|mitigation|mitigasi/.test(t)) return "risk";
  if (/action\s+plan|playbook|rencana/.test(t)) return "action";
  if (/data\s+(sources?|freshness|context)|sumber\s+data/.test(t)) return "data";
  if (/disclaimer/.test(t)) return "disclaimer";
  return "generic";
}

/**
 * Split content into ## sections. Anything before the first ## is treated
 * as a "summary" preamble so streaming responses render immediately.
 */
function parseSections(raw: string): { preamble: string; sections: Section[] } {
  // Strip leading code fences if any
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const sections: Section[] = [];
  let preambleLines: string[] = [];
  let cur: { title: string; lines: string[] } | null = null;

  const flush = () => {
    if (cur) {
      const title = cur.title.trim();
      sections.push({ kind: classifySection(title), title, body: cur.lines.join("\n").trim() });
    }
    cur = null;
  };

  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      cur = { title: h[1], lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  flush();
  return { preamble: preambleLines.join("\n").trim(), sections };
}

/* ---------- Pipe-table parser (fallback-safe) ---------- */

type Table = { headers: string[]; rows: string[][] };

function splitPipeRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitPipeRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

/**
 * Extracts the first markdown pipe-table from `body`, even when missing
 * surrounding blank lines or a proper separator row.
 * Heuristic: a "table" is 2+ consecutive lines starting and ending with `|`
 * AND each row has the same column count as the first row.
 */
function extractFirstPipeTable(body: string): { table: Table | null; before: string; after: string } {
  const lines = body.split("\n");
  let start = -1;
  let end = -1;
  let colCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l.startsWith("|") || !l.endsWith("|") || l.length < 3) continue;
    const cells = splitPipeRow(l);
    if (cells.length < 2) continue;
    // walk forward greedily
    start = i;
    colCount = cells.length;
    let j = i;
    while (j < lines.length) {
      const lj = lines[j].trim();
      if (!lj.startsWith("|") || !lj.endsWith("|")) break;
      const cj = splitPipeRow(lj);
      // tolerate separator row even if col mismatch by 0..1
      if (isSeparatorRow(lj) || Math.abs(cj.length - colCount) <= 1) {
        j++;
      } else break;
    }
    end = j - 1;
    if (end - start >= 1) break; // need at least 2 rows
    start = -1; end = -1;
  }

  if (start === -1 || end === -1) return { table: null, before: body, after: "" };

  const rows = lines.slice(start, end + 1).filter((l) => !isSeparatorRow(l));
  if (rows.length < 1) return { table: null, before: body, after: "" };

  const headers = splitPipeRow(rows[0]);
  const dataRows = rows.slice(1).map((r) => {
    const c = splitPipeRow(r);
    // pad/truncate to header length
    if (c.length < headers.length) return [...c, ...Array(headers.length - c.length).fill("")];
    if (c.length > headers.length) return c.slice(0, headers.length);
    return c;
  });

  const before = lines.slice(0, start).join("\n").trim();
  const after = lines.slice(end + 1).join("\n").trim();
  return { table: { headers, rows: dataRows }, before, after };
}

/* ---------- Per-stock detailed-analysis parser ---------- */

type StockBlock = { ticker: string; body: string };

function parseStockBlocks(body: string): { stocks: StockBlock[]; rest: string } {
  const lines = body.split("\n");
  const stocks: StockBlock[] = [];
  let restLines: string[] = [];
  let cur: { ticker: string; lines: string[] } | null = null;
  const flush = () => {
    if (cur) {
      stocks.push({ ticker: cur.ticker.trim(), body: cur.lines.join("\n").trim() });
      cur = null;
    }
  };
  for (const line of lines) {
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      cur = { ticker: h[1], lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      restLines.push(line);
    }
  }
  flush();
  return { stocks, rest: restLines.join("\n").trim() };
}

/* ============================================================================
   Block components
   ========================================================================== */

function SectionShell({
  icon,
  title,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "default" | "risk" | "data" | "action" | "summary" | "picks";
  children: React.ReactNode;
}) {
  const toneCls: Record<string, string> = {
    default:  "border-border/60 bg-card/60",
    summary:  "border-primary/25 bg-gradient-to-br from-primary/[0.06] to-card/60",
    picks:    "border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-card/60",
    risk:     "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] to-rose-500/[0.04]",
    action:   "border-sky-500/25 bg-gradient-to-br from-sky-500/[0.05] to-card/60",
    data:     "border-border/60 bg-muted/20",
  };
  const iconCls: Record<string, string> = {
    default: "bg-muted/40 text-muted-foreground",
    summary: "bg-primary/15 text-primary",
    picks:   "bg-emerald-500/15 text-emerald-400",
    risk:    "bg-amber-500/15 text-amber-400",
    action:  "bg-sky-500/15 text-sky-400",
    data:    "bg-muted/40 text-muted-foreground",
  };
  return (
    <section className={cn("rounded-xl border p-3.5 sm:p-4", toneCls[tone])}>
      <div className="mb-2.5 flex items-center gap-2">
        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", iconCls[tone])}>{icon}</div>
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-foreground/90">{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  );
}

function PicksBlock({ body }: { body: string }) {
  const { table, before, after } = useMemo(() => extractFirstPipeTable(body), [body]);

  return (
    <div className="space-y-3">
      {before && <ChatMarkdown content={before} />}
      {table ? (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60 bg-background/40">
            <table className="w-full text-[12.5px] border-collapse">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  {table.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {table.rows.map((row, ri) => {
                  const signalIdx = table.headers.findIndex((h) => /signal|action|rating/i.test(h));
                  const sig = signalIdx >= 0 ? row[signalIdx]?.toUpperCase() : "";
                  const tone = ACTION_TONES[sig];
                  return (
                    <tr
                      key={ri}
                      className={cn(
                        "border-l-2 transition-colors hover:bg-muted/15",
                        tone?.row ?? "border-l-transparent"
                      )}
                    >
                      {row.map((cell, ci) => {
                        if (ci === signalIdx) {
                          return <td key={ci} className="px-3 py-2 align-middle"><ActionBadge value={cell} /></td>;
                        }
                        const numeric = /^[\s\-+]?(?:Rp\s?)?[\d.,]+%?\s*(?:-\s*(?:Rp\s?)?[\d.,]+%?)?$/.test(cell);
                        const isTicker = ci === 0 && /^[A-Z]{2,6}(?:\.JK)?$/.test(cell.trim());
                        return (
                          <td
                            key={ci}
                            className={cn(
                              "px-3 py-2 align-middle",
                              isTicker ? "font-mono font-semibold text-foreground" : "",
                              numeric ? "text-right font-mono tabular-nums" : "text-left"
                            )}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stock cards */}
          <div className="md:hidden grid gap-2">
            {table.rows.map((row, ri) => {
              const obj: Record<string, string> = {};
              table.headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
              const signalKey = table.headers.find((h) => /signal|action|rating/i.test(h));
              const sig = signalKey ? (obj[signalKey] ?? "").toUpperCase() : "";
              const tone = ACTION_TONES[sig];
              const tickerKey = table.headers[0];
              return (
                <div
                  key={ri}
                  className={cn(
                    "rounded-lg border border-border/60 bg-card/60 p-3 border-l-2",
                    tone?.row ?? "border-l-transparent"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono font-semibold text-sm">{obj[tickerKey]}</div>
                    {sig && <ActionBadge value={sig} />}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                    {table.headers.slice(1).map((h) => {
                      if (h === signalKey) return null;
                      return (
                        <div key={h} className="flex flex-col">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{h}</dt>
                          <dd className="text-foreground/90 font-mono tabular-nums break-words">{obj[h] || "—"}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        // No table found — fallback to plain markdown so user still sees something
        body && <ChatMarkdown content={body} />
      )}
      {after && <ChatMarkdown content={after} />}
    </div>
  );
}

function RiskBlock({ body }: { body: string }) {
  return (
    <div className="text-[13px] [&_ul]:my-1 [&_li]:text-amber-100/90 [&_strong]:text-amber-200">
      <ChatMarkdown content={body} />
    </div>
  );
}

function DetailedBlock({ body }: { body: string }) {
  const { stocks, rest } = useMemo(() => parseStockBlocks(body), [body]);
  if (stocks.length === 0) {
    return <ChatMarkdown content={body} />;
  }
  return (
    <div className="space-y-3">
      {rest && <ChatMarkdown content={rest} />}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {stocks.map((s, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-6 w-6 rounded bg-primary/15 text-primary flex items-center justify-center">
                <CircleDot className="h-3 w-3" />
              </div>
              <div className="font-mono font-semibold text-[13px]">{s.ticker}</div>
            </div>
            <div className="text-[12.5px]">
              <ChatMarkdown content={s.body} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataBlock({ body }: { body: string }) {
  // Pull "Key: value" lines for chip rendering; everything else falls through.
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const chips: { k: string; v: string }[] = [];
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^[-*]?\s*([A-Za-z][\w\s/&-]{1,30}?):\s*(.+)$/.exec(l);
    if (m && m[2].length <= 60) chips.push({ k: m[1].trim(), v: m[2].trim() });
    else rest.push(l);
  }
  const toneFor = (v: string) => {
    const u = v.toLowerCase();
    if (/fresh|ok|live|available|healthy/.test(u)) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (/partial|stale|delayed|degraded/.test(u)) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    if (/unavailable|down|missing|n\/a|error/.test(u)) return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    return "bg-muted/40 text-muted-foreground border-border/60";
  };
  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span key={i} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]", toneFor(c.v))}>
              <span className="font-medium opacity-80">{c.k}:</span>
              <span className="font-mono">{c.v}</span>
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && <ChatMarkdown content={rest.join("\n")} />}
    </div>
  );
}

/* ---------- Top-level renderer ---------- */

export function AIReportRenderer({ content }: { content: string }) {
  const { preamble, sections } = useMemo(() => parseSections(content), [content]);

  // If the response has no recognised section headings, just delegate to markdown.
  if (sections.length === 0) {
    return <ChatMarkdown content={content} />;
  }

  return (
    <div className="space-y-3">
      {preamble && (
        <div className="text-[13.5px] text-foreground/90">
          <ChatMarkdown content={preamble} />
        </div>
      )}
      {sections.map((s, i) => {
        switch (s.kind) {
          case "summary":
            return (
              <SectionShell key={i} tone="summary" icon={<Activity className="h-3.5 w-3.5" />} title={s.title}>
                <div className="text-[13.5px]"><ChatMarkdown content={s.body} /></div>
              </SectionShell>
            );
          case "top-picks":
            return (
              <SectionShell key={i} tone="picks" icon={<TrendingUp className="h-3.5 w-3.5" />} title={s.title}>
                <PicksBlock body={s.body} />
              </SectionShell>
            );
          case "detailed":
            return (
              <SectionShell key={i} icon={<BarChart3 className="h-3.5 w-3.5" />} title={s.title}>
                <DetailedBlock body={s.body} />
              </SectionShell>
            );
          case "risk":
            return (
              <SectionShell key={i} tone="risk" icon={<ShieldAlert className="h-3.5 w-3.5" />} title={s.title}>
                <RiskBlock body={s.body} />
              </SectionShell>
            );
          case "action":
            return (
              <SectionShell key={i} tone="action" icon={<Target className="h-3.5 w-3.5" />} title={s.title}>
                <div className="text-[13px]"><ChatMarkdown content={s.body} /></div>
              </SectionShell>
            );
          case "data":
            return (
              <SectionShell key={i} tone="data" icon={<Database className="h-3.5 w-3.5" />} title={s.title}>
                <DataBlock body={s.body} />
              </SectionShell>
            );
          case "disclaimer":
            return (
              <div key={i} className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2 text-[11.5px] text-muted-foreground italic flex gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="[&_p]:m-0"><ChatMarkdown content={s.body} /></div>
              </div>
            );
          default:
            return (
              <SectionShell key={i} icon={<CircleDot className="h-3.5 w-3.5" />} title={s.title}>
                <ChatMarkdown content={s.body} />
              </SectionShell>
            );
        }
      })}
    </div>
  );
}
