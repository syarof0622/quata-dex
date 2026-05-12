import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { searchTicker } from "@/lib/market.functions";

type Suggestion = { symbol: string; name?: string; exchange?: string; type?: string };

function useDebounced<T>(value: T, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function TickerSearch({ className, onPick, placeholder, initialValue }: { className?: string; onPick?: (symbol: string) => void; placeholder?: string; initialValue?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState(initialValue ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q.trim(), 180);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sug = useQuery({
    queryKey: ["ticker-search", debounced],
    queryFn: () => searchTicker({ data: { q: debounced } }) as Promise<Suggestion[]>,
    enabled: debounced.length >= 1,
    staleTime: 30_000,
  });

  const items = (Array.isArray(sug.data) ? sug.data : []).slice(0, 8);

  useEffect(() => { setActive(0); }, [debounced]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(symbol: string) {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setOpen(false);
    if (onPick) { setQ(sym); onPick(sym); return; }
    setQ("");
    nav({ to: "/chart/$symbol", params: { symbol: sym } });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); setActive(a => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && items[active]) go(items[active].symbol);
      else if (q.trim()) go(q);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => q && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Search ticker (AAPL, NVDA, BBCA.JK)…"}
        className="pl-9 pr-9"
        autoComplete="off"
        spellCheck={false}
      />
      {sug.isFetching && debounced && (
        <Loader2 className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
      )}
      {open && debounced && (
        <div className="absolute z-50 mt-1 left-0 right-0 panel p-1 max-h-80 overflow-auto shadow-xl">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {sug.isFetching ? "Searching…" : `No matches. Press Enter to open ${q.toUpperCase()}.`}
            </div>
          ) : (
            items.map((it, i) => (
              <button
                key={`${it.symbol}-${i}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); go(it.symbol); }}
                className={`w-full text-left px-2.5 py-1.5 rounded flex items-center gap-3 ${i === active ? "bg-accent/60" : "hover:bg-accent/40"}`}
              >
                <span className="font-mono font-semibold text-sm w-24 truncate">{it.symbol}</span>
                <span className="text-xs text-muted-foreground flex-1 truncate">{it.name ?? ""}</span>
                <span className="text-[10px] text-muted-foreground/80 ml-auto">{it.exchange ?? it.type ?? ""}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
