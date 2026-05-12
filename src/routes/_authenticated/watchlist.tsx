import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/watchlist.functions";
import { rankWatchlist } from "@/lib/screener.functions";
import { Button } from "@/components/ui/button";
import { formatPct, colorForChange } from "@/lib/format";
import { formatLocalPrice, IDX_LQ45, US_TOP } from "@/lib/symbols";
import { X, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Sparkline } from "./screener";

export const Route = createFileRoute("/_authenticated/watchlist")({
  head: () => ({ meta: [{ title: "Watchlist — Quanta Terminal" }] }),
  component: WL,
});

const PRESETS: { label: string; symbols: string[] }[] = [
  { label: "🇮🇩 IDX Bank Big 4", symbols: ["BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK"] },
  { label: "🇮🇩 IDX Telco & Tech", symbols: ["TLKM.JK", "EXCL.JK", "ISAT.JK", "GOTO.JK", "BUKA.JK", "EMTK.JK"] },
  { label: "🇮🇩 IDX Energy & Mining", symbols: ["ADRO.JK", "PTBA.JK", "ITMG.JK", "MEDC.JK", "INCO.JK", "ANTM.JK", "MDKA.JK"] },
  { label: "🇮🇩 IDX Consumer", symbols: ["UNVR.JK", "ICBP.JK", "INDF.JK", "KLBF.JK", "MAPI.JK", "ACES.JK"] },
  { label: "🇮🇩 IDX LQ45 Top 15", symbols: IDX_LQ45.slice(0, 15) },
  { label: "🇺🇸 US Mega Cap", symbols: US_TOP.slice(0, 8) },
];

function WL() {
  const qc = useQueryClient();
  const [view, setView] = useState<"smart" | "simple">("smart");
  const wl = useQuery({ queryKey: ["watchlist"], queryFn: () => getWatchlist() });
  const wlRows: any[] = Array.isArray(wl.data) ? wl.data : [];
  const symbols = wlRows.map((w: any) => w.symbol).filter(Boolean);
  const ranked = useQuery({
    queryKey: ["wl-rank", symbols.join(",")],
    queryFn: () => rankWatchlist({ data: { symbols } }),
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });
  const rankedRows: any[] = Array.isArray(ranked.data) ? ranked.data : [];

  const addPreset = async (preset: string[]) => {
    const toAdd = preset.filter(s => !symbols.includes(s));
    if (!toAdd.length) { toast.info("Semua sudah ada di watchlist"); return; }
    await Promise.all(toAdd.map(s => addToWatchlist({ data: { symbol: s } })));
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    toast.success(`Added ${toAdd.length} symbols`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Sparkles className="size-5 text-primary" /> Watchlist Intelligence</h1>
          <p className="text-sm text-muted-foreground">Setiap saham di-ranking otomatis oleh AI Signal v2.</p>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["smart", "simple"] as const).map(v => (
            <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} onClick={() => setView(v)} className="h-7 px-3 capitalize">{v}</Button>
          ))}
        </div>
      </div>

      {/* Quick presets */}
      <div className="panel p-3">
        <div className="text-xs text-muted-foreground mb-2">Quick add presets</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <Button key={p.label} size="sm" variant="outline" onClick={() => addPreset(p.symbols)}>
              <Plus className="size-3 mr-1" /> {p.label}
            </Button>
          ))}
        </div>
      </div>

      {symbols.length === 0 ? (
        <div className="panel p-8 text-center text-muted-foreground">
          Empty. Pilih preset di atas atau buka chart dan klik <span className="text-foreground">★</span>.
        </div>
      ) : view === "smart" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rankedRows.map(r => (
            <Link key={r.symbol} to="/chart/$symbol" params={{ symbol: r.symbol }} className="panel p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{r.symbol}</div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-[20ch]">{r.shortName}</div>
                </div>
                <button onClick={async (e) => {
                  e.preventDefault(); e.stopPropagation();
                  await removeFromWatchlist({ data: { symbol: r.symbol } });
                  qc.invalidateQueries({ queryKey: ["watchlist"] });
                }} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="font-mono text-lg">{formatLocalPrice(r.symbol, r.price)}</div>
                  <div className={`text-xs font-mono ${colorForChange(r.changePct)}`}>{formatPct(r.changePct)}</div>
                </div>
                <Sparkline values={r.sparkline ?? []} bull={(r.score ?? 0) > 0} width={100} height={32} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${labelColor(r.label ?? "NEUTRAL")}`}>{(r.label ?? "NEUTRAL").replace("_", " ")}</span>
                <div className="text-[11px] text-muted-foreground">
                  Score <span className={`font-mono ${(r.score ?? 0) > 0 ? "text-bull" : (r.score ?? 0) < 0 ? "text-bear" : ""}`}>{r.score ?? 0}</span>
                  {" · "}Conf <span className="font-mono">{r.confidence ?? 0}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                <Mini label="RSI" value={r.rsi ?? "—"} highlight={(r.rsi ?? 50) > 70 || (r.rsi ?? 50) < 30} />
                <Mini label="ADX" value={r.trendStrength ?? "—"} highlight={(r.trendStrength ?? 0) > 40} />
                <Mini label="Vol×" value={`${(r.volRel ?? 1).toFixed(1)}×`} highlight={(r.volRel ?? 1) > 1.5} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel p-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Symbol</th>
                <th className="text-left p-2">Name</th>
                <th className="text-right p-2">Price</th>
                <th className="text-right p-2">Change</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map(r => (
                <tr key={r.symbol} className="border-t border-border hover:bg-accent/30">
                  <td className="p-2 font-medium"><Link to="/chart/$symbol" params={{ symbol: r.symbol }}>{r.symbol}</Link></td>
                  <td className="p-2 text-muted-foreground truncate max-w-[28ch]">{r.shortName}</td>
                  <td className="p-2 text-right font-mono">{formatLocalPrice(r.symbol, r.price)}</td>
                  <td className={`p-2 text-right font-mono ${colorForChange(r.changePct)}`}>{formatPct(r.changePct)}</td>
                  <td className="p-2 text-right">
                    <Button size="icon" variant="ghost" onClick={async () => {
                      await removeFromWatchlist({ data: { symbol: r.symbol } });
                      qc.invalidateQueries({ queryKey: ["watchlist"] });
                    }}>
                      <X className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`panel-2 p-1.5 text-center ${highlight ? "ring-1 ring-primary/40" : ""}`}>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-foreground">{value}</div>
    </div>
  );
}

function labelColor(l: string) {
  if (l === "STRONG_BUY") return "bg-bull text-primary-foreground";
  if (l === "BUY") return "bg-bull-soft text-bull";
  if (l === "STRONG_SELL") return "bg-bear text-primary-foreground";
  if (l === "SELL") return "bg-bear-soft text-bear";
  return "bg-accent/40 text-muted-foreground";
}
