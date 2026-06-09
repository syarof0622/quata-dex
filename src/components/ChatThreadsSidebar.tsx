import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MessageSquare, Trash2, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listChatThreads,
  createChatThread,
  deleteChatThread,
  renameChatThread,
} from "@/lib/chat-threads.functions";

type Thread = { id: string; title: string; updated_at: string };

export function ChatThreadsSidebar({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listChatThreads);
  const createFn = useServerFn(createChatThread);
  const deleteFn = useServerFn(deleteChatThread);
  const renameFn = useServerFn(renameChatThread);

  const { data, isLoading } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => listFn(),
    staleTime: 10_000,
  });
  const threads: Thread[] = (data as any)?.threads ?? [];

  // No auto-select: landing on /ai without ?t= means user wants a fresh session.
  // They can explicitly pick a thread from the sidebar to resume.

  const refresh = () => qc.invalidateQueries({ queryKey: ["chat-threads"] });

  const handleNew = async () => {
    try {
      const r: any = await createFn({ data: {} });
      await refresh();
      onSelect(r?.thread?.id ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal membuat percakapan");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus percakapan ini?")) return;
    try {
      await deleteFn({ data: { id } });
      if (activeId === id) onSelect(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal menghapus");
    }
  };

  const handleRename = async (t: Thread) => {
    const next = prompt("Ubah judul percakapan:", t.title);
    if (!next || next.trim() === t.title) return;
    try {
      await renameFn({ data: { id: t.id, title: next.trim() } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal mengubah judul");
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card/40 backdrop-blur h-[calc(100vh-220px)] min-h-[520px] overflow-hidden">
      <div className="p-2.5 border-b border-border/60">
        <Button
          onClick={handleNew}
          size="sm"
          className="w-full justify-start gap-2 bg-gradient-to-br from-primary to-primary/80"
        >
          <Plus className="h-4 w-4" /> Percakapan Baru
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {!isLoading && threads.length === 0 && (
          <div className="text-[12px] text-muted-foreground p-3 text-center">
            Belum ada riwayat. Mulai percakapan baru.
          </div>
        )}
        {threads.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] cursor-pointer transition-colors",
              activeId === t.id
                ? "bg-primary/15 text-foreground border border-primary/30"
                : "hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent"
            )}
            onClick={() => onSelect(t.id)}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="flex-1 truncate" title={t.title}>{t.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleRename(t); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background/60"
              aria-label="Ubah judul"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-destructive"
              aria-label="Hapus"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
