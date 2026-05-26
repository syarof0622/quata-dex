import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Action keywords → colored badge classes
const ACTION_TONES: Record<string, string> = {
  "STRONG BUY": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "BUY": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "ACCUMULATE": "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "TACTICAL BUY": "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "WATCH": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "HOLD": "bg-slate-500/15 text-slate-300 border-slate-500/30",
  "AVOID": "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "SELL": "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "HIGH RISK": "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function ActionBadge({ value }: { value: string }) {
  const v = value.trim().toUpperCase();
  const tone = ACTION_TONES[v];
  if (!tone) return <>{value}</>;
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tone)}>
      {v}
    </span>
  );
}

function isNumericCell(text: string) {
  return /^[\s\-+]?(?:Rp\s?)?[\d.,]+%?\s*(?:-\s*(?:Rp\s?)?[\d.,]+%?)?$/.test(text.trim());
}

// Cleanup AI-generated markdown before render: collapse duplicate heading markers,
// fix known disclaimer typos, and normalise spacing. Pure formatting — no semantic changes.
function cleanMarkdownText(input: string): string {
  let s = input ?? "";
  // Collapse "## ## " / "### ### " / "#### #### " duplicates (and triples) at line start.
  s = s.replace(/^(#{1,6})\s+(#{1,6})\s+/gm, "$1 ");
  s = s.replace(/^(#{1,6})\s+(#{1,6})\s+/gm, "$1 "); // run twice for triples
  // Disclaimer typo cleanup.
  s = s.replace(/wires\s+uang\s+asli/gi, "transaksi uang asli");
  return s;
}

export function ChatMarkdown({ content }: { content: string }) {
  const cleaned = cleanMarkdownText(content);
  return (
    <div className="text-[13.5px] leading-relaxed text-foreground/95 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-semibold mt-4 mb-2 text-foreground">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[15px] font-semibold mt-4 mb-2 text-foreground flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary" />{children}</h2>,
          h3: ({ children }) => <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5">{children}</h3>,
          p: ({ children }) => <p className="my-2 text-foreground/90">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
          ul: ({ children }) => <ul className="my-2 ml-4 space-y-1 list-disc marker:text-primary/60">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-4 space-y-1 list-decimal marker:text-primary/60">{children}</ol>,
          li: ({ children }) => <li className="pl-1 text-foreground/90">{children}</li>,
          hr: () => <hr className="my-3 border-border/60" />,
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-lg border-l-2 border-amber-500/60 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-100/90">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }: any) => {
            const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-3 text-[12px] leading-relaxed">
                  <code className={className} {...props}>{children}</code>
                </pre>
              );
            }
            return <code className="rounded bg-background/60 border border-border/40 px-1 py-0.5 text-[12px] font-mono">{children}</code>;
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-border/60 bg-background/40">
              <table className="w-full text-[12.5px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/40 text-muted-foreground">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border/40">{children}</tbody>,
          tr: ({ children }) => <tr className="even:bg-muted/10 hover:bg-muted/20 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">{children}</th>,
          td: ({ children }) => {
            const txt = Array.isArray(children) ? children.map(String).join("") : String(children ?? "");
            const upper = txt.trim().toUpperCase();
            if (ACTION_TONES[upper]) {
              return <td className="px-3 py-2 align-middle"><ActionBadge value={upper} /></td>;
            }
            const numeric = isNumericCell(txt);
            return (
              <td className={cn("px-3 py-2 align-middle", numeric ? "text-right font-mono tabular-nums" : "text-left")}>
                {children}
              </td>
            );
          },
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
