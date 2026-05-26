import { useQuery, useMutation } from "@tanstack/react-query";
import { listJournal, journalStats, updateJournal, aiReviewJournal } from "@/lib/journal.functions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Sparkles, Pencil } from "lucide-react";
import { formatPrice, formatDateTimeWIB } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function JournalPanel() {
  const list = useQuery({ queryKey: ["journal"], queryFn: () => listJournal(), refetchInterval: 15000 });
  const stats = useQuery({ queryKey: ["journal-stats"], queryFn: () => journalStats(), refetchInterval: 15000 });
  const review = useMutation({
    mutationFn: () => aiReviewJournal({ data: { mode: "session" } }),
    onError: (e: any) => toast.error(e?.message ?? "AI review failed"),
  });
  const [editing, setEditing] = useState<any | null>(null);

  const s = stats.data;
  return (
    <div className="space-y-3">
      {s && (
        <div className="grid md:grid-cols-5 gap-2">
          <Stat label="Trades" value={s.total ?? 0} />
          <Stat label="Closed" value={s.closed ?? 0} />
          <Stat label="Win rate" value={(Number(s.winRate) || 0).toFixed(1) + "%"} tone={(s.winRate ?? 0) >= 50 ? "bull" : "bear"} />
          <Stat label="Total P/L" value={"$" + formatPrice(s.totalPnl ?? 0)} tone={(s.totalPnl ?? 0) >= 0 ? "bull" : "bear"} />
          <Stat label="Expectancy" value={"$" + formatPrice(s.expectancy ?? 0)} tone={(s.expectancy ?? 0) >= 0 ? "bull" : "bear"} />
        </div>
      )}

      <div className="panel p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> AI Session Review</div>
          <Button size="sm" onClick={() => review.mutate()} disabled={review.isPending}>
            {review.isPending ? "Analyzing…" : "Review my recent trades"}
          </Button>
        </div>
        {review.data?.review && (
          <div className="prose prose-sm prose-invert max-w-none border-t border-border pt-3">
            <ReactMarkdown>{review.data.review}</ReactMarkdown>
          </div>
        )}
      </div>

      <div className="panel p-2">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Symbol</th>
              <th className="text-left p-2">Side</th>
              <th className="text-right p-2">Qty @ Price</th>
              <th className="text-left p-2">Setup</th>
              <th className="text-left p-2">Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2 font-medium">{r.symbol}</td>
                <td className={`p-2 uppercase text-xs ${r.side === "buy" ? "text-bull" : "text-bear"}`}>{r.side}</td>
                <td className="p-2 text-right font-mono text-xs">{r.qty} @ {formatPrice(r.price)}</td>
                <td className="p-2 text-xs">{r.setup ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[280px] truncate">{r.notes ?? "—"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="size-3" /></Button>
                </td>
              </tr>
            ))}
            {!(list.data?.length) && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No journal entries yet. Trades log automatically when filled.</td></tr>}
          </tbody>
        </table>
      </div>

      <EditDialog entry={editing} onClose={() => { setEditing(null); list.refetch(); stats.refetch(); }} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bull" | "bear" }) {
  return (
    <div className="panel p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}

function EditDialog({ entry, onClose }: { entry: any | null; onClose: () => void }) {
  const [setup, setSetup] = useState("");
  const [emotion, setEmotion] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);

  if (entry && entry.id !== lastId) {
    setLastId(entry.id);
    setSetup(entry.setup ?? "");
    setEmotion(entry.emotion ?? "");
    setNotes(entry.notes ?? "");
    setTags((entry.tags ?? []).join(", "));
  }

  const save = useMutation({
    mutationFn: () => updateJournal({ data: {
      id: entry.id, setup, emotion, notes,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    } }),
    onSuccess: () => { toast.success("Journal updated"); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });
  const aiTrade = useMutation({
    mutationFn: () => aiReviewJournal({ data: { id: entry.id, mode: "trade" } }),
    onError: (e: any) => toast.error(e?.message ?? "AI failed"),
  });

  if (!entry) return null;

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry.symbol} · {entry.side.toUpperCase()} {entry.qty} @ {formatPrice(entry.price)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Setup / Strategy</label>
            <Input value={setup} onChange={e => setSetup(e.target.value)} placeholder="e.g. RSI bounce, EMA cross, breakout" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Emotion</label>
            <Input value={emotion} onChange={e => setEmotion(e.target.value)} placeholder="confident · fomo · revenge · disciplined" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="What was your thesis? How did it play out?" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tags (comma separated)</label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="swing, breakout, idx" />
          </div>
          {entry.ai_review && (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-1">Latest AI review</div>
              <div className="prose prose-sm prose-invert max-w-none text-xs">
                <ReactMarkdown>{entry.ai_review}</ReactMarkdown>
              </div>
            </div>
          )}
          {aiTrade.data?.review && (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-1">New AI review</div>
              <div className="prose prose-sm prose-invert max-w-none text-xs">
                <ReactMarkdown>{aiTrade.data.review}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => aiTrade.mutate()} disabled={aiTrade.isPending}>
            <Sparkles className="size-3 mr-1" /> {aiTrade.isPending ? "Analyzing…" : "AI grade this trade"}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
