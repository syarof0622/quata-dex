import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ChatPanel({ system }: { system?: string }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const userMsg = { role: "user" as const, content: input.trim() };
    setMessages(m => [...m, userMsg]);
    setInput(""); setBusy(true);
    try {
      const resp = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg], system }),
      });
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        toast.error(j.error ?? "Chat failed"); setBusy(false); return;
      }
      const reader = resp.body.getReader(); const decoder = new TextDecoder();
      let buf = ""; let acc = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
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
            const c = p.choices?.[0]?.delta?.content; if (c) {
              acc += c;
              setMessages(m => m.map((mm, i) => i === m.length - 1 ? { ...mm, content: acc } : mm));
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-[480px]">
      <div className="flex-1 overflow-auto space-y-3 pr-2">
        {messages.length === 0 && <div className="text-sm text-muted-foreground text-center py-10">Start a conversation. Try: "Is NVDA overbought right now?"</div>}
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded-md text-sm ${m.role === "user" ? "bg-accent/40 ml-12" : "panel-2 mr-12"}`}>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">{m.role}</div>
            <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{m.content || "…"}</ReactMarkdown></div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask anything about the markets…" disabled={busy} />
        <Button onClick={send} disabled={busy}>{busy ? "Thinking…" : "Send"}</Button>
      </div>
    </div>
  );
}
