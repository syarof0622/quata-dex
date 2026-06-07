import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, Send, Sparkles, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIReportRenderer } from "@/components/AIReportRenderer";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "Cek portfolio saya",
  "Top momentum hari ini",
  "Saham undervalue",
  "Kenapa AI Agent tidak buy?",
];

export function FloatingAIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) {
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!resp.ok || !resp.body) {
        toast.error("Chat gagal");
        setBusy(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") continue;
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              acc += c;
              setMessages(m => m.map((mm, i) => i === m.length - 1 ? { ...mm, content: acc } : mm));
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating button — always reachable, above mobile bottom nav */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Tutup AI" : "Buka AI"}
        className={cn(
          "fixed z-50 right-3 md:right-5 grid place-items-center",
          "h-12 w-12 md:h-14 md:w-14 rounded-full shadow-xl",
          "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
          "ring-2 ring-primary/30 hover:scale-105 active:scale-95 transition-transform",
        )}
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
        }}
      >
        {open ? <X className="h-5 w-5 md:h-6 md:w-6" /> : <Bot className="h-5 w-5 md:h-6 md:w-6" />}
        {!open && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-background" />
          </span>
        )}
      </button>

      {/* Bubble panel — full-screen sheet on mobile, anchored card on desktop */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden border border-border/70 bg-card/95 backdrop-blur-xl shadow-2xl",
              // Mobile: full-screen-ish sheet pinned to bottom
              "left-2 right-2 rounded-2xl",
              // Desktop: anchored card near the button
              "md:left-auto md:right-5 md:w-[400px] lg:w-[440px] md:rounded-2xl",
            )}
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 156px)",
              top: "max(env(safe-area-inset-top, 0px), 64px)",
              // On md+, override the top with auto via max-height — but we can use class for that
              maxHeight: "min(680px, calc(100vh - 180px))",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2.5 bg-gradient-to-r from-primary/10 to-transparent">
              <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/30 grid place-items-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold leading-tight">Analis AI</div>
                <div className="text-[10.5px] text-muted-foreground leading-tight">Tanya pasar, portfolio, atau ticker</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-md hover:bg-muted/60 grid place-items-center text-muted-foreground"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[12.5px] text-muted-foreground leading-relaxed">
                    Hai 👋 Saya bisa bantu analisis ticker, baca momentum, atau diagnosa AI Agent. Pilih ide cepat di bawah atau ketik pertanyaan.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => void sendText(p)}
                        className="text-left text-[11.5px] rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-primary/40 px-2.5 py-2 leading-snug transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <Bubble key={i} message={m} streaming={busy && i === messages.length - 1 && m.role === "assistant"} />
                ))
              )}
              <div ref={endRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-border/60 bg-background/80 backdrop-blur px-3 py-2.5">
              <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-card/70 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 px-2.5 py-1.5">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendText(input); } }}
                  rows={1}
                  placeholder="Tanya AI…"
                  disabled={busy}
                  className="flex-1 resize-none bg-transparent text-[13px] placeholder:text-muted-foreground/70 focus:outline-none max-h-28 py-1.5"
                />
                <Button
                  onClick={() => void sendText(input)}
                  disabled={busy || !input.trim()}
                  size="sm"
                  className="h-8 w-8 p-0 rounded-lg bg-gradient-to-br from-primary to-primary/80"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Bubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="shrink-0 h-7 w-7 rounded-full bg-primary/15 border border-primary/30 grid place-items-center">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed shadow-sm max-w-[82%]",
          isUser
            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-br-md"
            : "bg-card/80 border border-border/60 rounded-bl-md"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : message.content ? (
          <AIReportRenderer content={message.content} />
        ) : (
          <div className="text-muted-foreground italic">…</div>
        )}
        {!isUser && streaming && message.content && (
          <span className="inline-block w-1 h-3 ml-0.5 bg-primary/70 align-middle animate-pulse" />
        )}
      </div>
      {isUser && (
        <div className="shrink-0 h-7 w-7 rounded-full bg-muted/60 border border-border/60 grid place-items-center">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
