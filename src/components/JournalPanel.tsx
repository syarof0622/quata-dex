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
import { useLang } from "@/hooks/use-language";

export function JournalPanel() {
  const { L } = useLang();
  const J = L.body.journal;
  const list = useQuery({ queryKey: ["journal"], queryFn: () => listJournal(), refetchInterval: 15000 });
  const stats = useQuery({ queryKey: ["journal-stats"], queryFn: () => journalStats(), refetchInterval: 15000 });
  const review = useMutation({
    mutationFn: () => aiReviewJournal({ data: { mode: "session" } }),
    onError: (e: any) => toast.error(e?.message ?? J.aiReviewFailed),
  });
  const [editing, setEditing] = useState<any | null>(null);

  const s = stats.data;
  return (
    <div className="space-y-3">
      {s && (
        <div className="grid md:grid-cols-5 gap-2">
          <Stat label={J.trades} value={s.total ?? 0} />
          <Stat label={J.closed} value={s.closed ?? 0} />
          <Stat label={J.winRate} value={s.winRate == null ? "N/A" : Number(s.winRate).toFixed(1) + "%"} tone={s.winRate == null ? undefined : Number(s.winRate) >= 50 ? "bull" : "bear"} />
          <Stat label={J.totalPnl} value={"$" + formatPrice(s.totalPnl ?? 0)} tone={(s.totalPnl ?? 0) >= 0 ? "bull" : "bear"} />
          <Stat label={J.expectancy} value={"$" + formatPrice(s.expectancy ?? 0)} tone={(s.expectancy ?? 0) >= 0 ? "bull" : "bear"} />
        </div>
      )}

      <div className="panel p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> {J.aiReview}</div>
          <Button size="sm" onClick={() => review.mutate()} disabled={review.isPending}>
            {review.isPending ? J.analyzing : J.reviewBtn}
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
              <th className="text-left p-2">{J.thTime}</th>
              <th className="text-left p-2">{J.thSymbol}</th>
              <th className="text-left p-2">{J.thSide}</th>
              <th className="text-right p-2">{J.thQtyPrice}</th>
              <th className="text-left p-2">{J.thSetup}</th>
              <th className="text-left p-2">{J.thNotes}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-2 text-xs text-muted-foreground">{formatDateTimeWIB(r.created_at)}</td>
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
            {!(list.data?.length) && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{J.empty}</td></tr>}
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
  const { L } = useLang();
  const J = L.body.journal;
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
    onSuccess: () => { toast.success(J.saved); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? J.updateFailed),
  });
  const aiTrade = useMutation({
    mutationFn: () => aiReviewJournal({ data: { id: entry.id, mode: "trade" } }),
    onError: (e: any) => toast.error(e?.message ?? J.aiFailed),
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
            <label className="text-xs text-muted-foreground">{J.setupLabel}</label>
            <Input value={setup} onChange={e => setSetup(e.target.value)} placeholder={J.setupPh} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{J.emotion}</label>
            <Input value={emotion} onChange={e => setEmotion(e.target.value)} placeholder={J.emotionPh} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{J.notes}</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder={J.notesPh} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{J.tags}</label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder={J.tagsPh} />
          </div>
          {entry.ai_review && (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-1">{J.latestAi}</div>
              <div className="prose prose-sm prose-invert max-w-none text-xs">
                <ReactMarkdown>{entry.ai_review}</ReactMarkdown>
              </div>
            </div>
          )}
          {aiTrade.data?.review && (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-1">{J.newAi}</div>
              <div className="prose prose-sm prose-invert max-w-none text-xs">
                <ReactMarkdown>{aiTrade.data.review}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => aiTrade.mutate()} disabled={aiTrade.isPending}>
            <Sparkles className="size-3 mr-1" /> {aiTrade.isPending ? J.analyzing : J.gradeBtn}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? J.analyzing : J.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
