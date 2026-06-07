import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AIReportRenderer } from "@/components/AIReportRenderer";
import { Send, Loader2, Copy, RotateCcw, Sparkles, TrendingUp, ShieldAlert, Search, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/hooks/use-language";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function ChatPanel({ system }: { system?: string }) {
  const { L } = useLang();
  const T = L.body.chat;
  const promptChips = useMemo(() => ([
    { icon: ShieldAlert, label: T.chips.checkPortfolio },
    { icon: User, label: T.chips.explainOpenPos },
    { icon: Bot, label: T.chips.whyNotBuy },
    { icon: Bot, label: T.chips.evalAgent },
    { icon: TrendingUp, label: T.chips.topMomentum },
    { icon: Sparkles, label: T.chips.undervalued },
    { icon: Search, label: T.chips.bestScreener },
    { icon: ShieldAlert, label: T.chips.activeAlerts },
    { icon: Search, label: T.chips.dataSource },
  ]), [T]);
  const welcomeCards = useMemo(() => ([
    { icon: TrendingUp, title: T.cards.marketRec.title, body: T.cards.marketRec.body },
    { icon: Search, title: T.cards.tickerAnalysis.title, body: T.cards.tickerAnalysis.body },
    { icon: ShieldAlert, title: T.cards.portfolioRisk.title, body: T.cards.portfolioRisk.body },
    { icon: Bot, title: T.cards.agentDiag.title, body: T.cards.agentDiag.body },
  ]), [T]);
  const phases = T.phases as readonly string[];

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!busy) return;
    setPhaseIdx(0);
    const t = setInterval(() => setPhaseIdx(i => (i + 1) % phases.length), 1400);
    return () => clearInterval(t);
  }, [busy, phases.length]);

  const lastAssistantStreaming = busy && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content;

  const sendText = async (text: string, base?: ChatMessage[]) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = base ?? messages;
    const next = [...history, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, system }),
      });
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({} as any));
        toast.error(j.error ?? "Chat failed");
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

  const regenerate = () => {
    // Find last user message and resend with history up to that point
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") { lastUserIdx = i; break; }
    if (lastUserIdx === -1) return;
    const lastUser = messages[lastUserIdx];
    const base = messages.slice(0, lastUserIdx);
    setMessages(base);
    void sendText(lastUser.content, base);
  };

  const copy = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendText(input); }
  };

  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[520px] rounded-2xl border border-border/60 bg-gradient-to-b from-card/60 to-background/60 backdrop-blur overflow-hidden">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-5">
        <div className="mx-auto max-w-[1100px] space-y-5">
          {showWelcome && <WelcomeState onPick={(t) => void sendText(t)} />}

          {messages.map((m, i) => (
            <MessageRow key={i} message={m} onCopy={() => copy(m.content)} onRegenerate={i === messages.length - 1 && m.role === "assistant" && !busy ? regenerate : undefined} streaming={busy && i === messages.length - 1 && m.role === "assistant"} />
          ))}

          {lastAssistantStreaming && <TypingIndicator phase={STREAMING_PHASES[phaseIdx]} />}
          <div ref={endRef} />
        </div>
      </div>

      {/* Sticky composer */}
      <div className="border-t border-border/60 bg-background/80 backdrop-blur-md px-3 sm:px-6 py-3 sm:py-4">
        <div className="mx-auto max-w-[1100px] space-y-2.5">
          {/* Prompt chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
            {PROMPT_CHIPS.map((p) => (
              <button
                key={p.label}
                onClick={() => void sendText(p.label)}
                disabled={busy}
                className="group flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card/60 hover:bg-card hover:border-primary/40 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <p.icon className="h-3 w-3 text-primary/70 group-hover:text-primary" />
                <span className="whitespace-nowrap">{p.label}</span>
              </button>
            ))}
          </div>
          {/* Composer */}
          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-card/70 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 transition-all px-3 py-2 shadow-sm">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Tanya AI: saham apa yang layak dibeli, risiko portfolio, atau analisis ticker…"
              disabled={busy}
              className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/70 focus:outline-none max-h-32 py-1.5"
            />
            <Button
              onClick={() => void sendText(input)}
              disabled={busy || !input.trim()}
              size="sm"
              className="h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 hover:opacity-90 shadow-md disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="text-[10.5px] text-muted-foreground/70 px-1 flex items-center justify-between">
            <span>Enter to send · Shift+Enter for newline</span>
            <span className="italic">Analisis untuk simulasi & riset — keputusan investasi tetap perlu validasi mandiri.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message, onCopy, onRegenerate, streaming }: { message: ChatMessage; onCopy: () => void; onRegenerate?: () => void; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3 w-full", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={cn("group flex flex-col", isUser ? "items-end max-w-[80%] sm:max-w-[60%]" : "max-w-[95%] sm:max-w-[85%] flex-1")}>
        <div
          className={cn(
            "shadow-sm",
            isUser
              ? "rounded-2xl rounded-br-md px-4 py-3 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
              : "rounded-2xl rounded-bl-md border border-border/60 bg-gradient-to-b from-card/90 to-card/60 px-3.5 py-3 sm:px-4 sm:py-3.5"
          )}
        >
          {isUser ? (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
          ) : message.content ? (
            <AIReportRenderer content={message.content} />
          ) : (
            <div className="text-sm text-muted-foreground italic">…</div>
          )}
          {!isUser && streaming && message.content && (
            <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary/70 align-middle animate-pulse" />
          )}
        </div>
        {!isUser && message.content && !streaming && (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onCopy} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50">
              <Copy className="h-3 w-3" /> Copy
            </button>
            {onRegenerate && (
              <button onClick={onRegenerate} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50">
                <RotateCcw className="h-3 w-3" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 h-8 w-8 rounded-full bg-muted/60 border border-border/60 flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ phase }: { phase: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center">
        <Bot className="h-4 w-4 text-primary animate-pulse" />
      </div>
      <div className="rounded-2xl rounded-bl-md border border-border/60 bg-card/60 px-4 py-3 shadow-sm space-y-2 min-w-[260px]">
        <div className="text-[12px] text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          {phase}
        </div>
        <div className="space-y-1.5">
          <div className="h-2 rounded bg-muted/60 animate-pulse w-3/4" />
          <div className="h-2 rounded bg-muted/40 animate-pulse w-1/2" />
          <div className="h-2 rounded bg-muted/30 animate-pulse w-2/3" />
        </div>
      </div>
    </div>
  );
}

function WelcomeState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="py-6">
      <div className="text-center space-y-2 mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] text-primary uppercase tracking-wider">
          <Sparkles className="h-3 w-3" /> AI Trading Analyst
        </div>
        <h2 className="text-xl font-semibold">Siap membantu membaca market.</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Tanya seputar rekomendasi saham, analisis ticker, atau diagnosis AI Trade Agent. Jawaban grounded di live market context.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
        {WELCOME_CARDS.map((c) => (
          <button
            key={c.title}
            onClick={() => onPick(c.body)}
            className="group text-left rounded-xl border border-border/60 bg-card/40 hover:bg-card hover:border-primary/40 p-3.5 transition-all"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                <c.icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="text-[13px] font-semibold">{c.title}</div>
            </div>
            <div className="text-[12px] text-muted-foreground group-hover:text-foreground/80">{c.body}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
