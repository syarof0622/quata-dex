import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, History } from "lucide-react";
import { toast } from "sonner";
import { formatIDRCompact } from "@/lib/format";
import {
  getMyPaperAccount, setMyPaperBalance, resetMyPaperAccount, getMyBalanceHistory,
} from "@/lib/paper-account.functions";
import { useLang } from "@/hooks/use-language";

export function PaperBalanceCard() {
  const { L, lang } = useLang();
  const T = L.body.paperBalance;
  const qc = useQueryClient();
  const get = useServerFn(getMyPaperAccount);
  const setBal = useServerFn(setMyPaperBalance);
  const reset = useServerFn(resetMyPaperAccount);
  const getHist = useServerFn(getMyBalanceHistory);

  const { data, isLoading } = useQuery({ queryKey: ["my-paper"], queryFn: () => get({}) });
  const { data: hist } = useQuery({ queryKey: ["my-balance-history"], queryFn: () => getHist({}) });
  const active = data?.active;

  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"IDR" | "USD">("IDR");
  const [resetMode, setResetMode] = useState<"balance_only" | "reset_account" | "new_account">("balance_only");
  const [resetAmount, setResetAmount] = useState("100000000");

  useEffect(() => {
    if (active) {
      setAmount(String(active.starting_balance ?? 100000000));
      setName(active.account_name ?? T.defaultAccountName);
      setCurrency((active.currency as any) ?? "IDR");
    }
  }, [active?.id]);

  const setMut = useMutation({
    mutationFn: async () => setBal({ data: { starting_balance: Number(amount), account_name: name, currency }}),
    onSuccess: () => { toast.success(T.saved); qc.invalidateQueries({ queryKey: ["my-paper"] }); qc.invalidateQueries({ queryKey: ["my-balance-history"] }); },
    onError: (e: any) => toast.error(T.failed, { description: e?.message }),
  });

  const resetMut = useMutation({
    mutationFn: async () => reset({ data: { mode: resetMode, starting_balance: Number(resetAmount) }}),
    onSuccess: () => { toast.success(T.resetSuccess); qc.invalidateQueries({ queryKey: ["my-paper"] }); qc.invalidateQueries({ queryKey: ["my-balance-history"] }); },
    onError: (e: any) => toast.error(T.resetFailed, { description: e?.message }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">{T.loading}</div>;

  const localeForDate = lang === "id" ? "id-ID" : "en-US";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="size-4" /> {T.title}</CardTitle>
          <CardDescription>
            {T.desc} <Badge variant="outline" className="ml-1">{T.paperOnly}</Badge> — {T.noBroker}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{T.startingBalance}</Label>
              <Input type="number" min={1000} step={1000} value={amount} onChange={e => setAmount(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">{amount ? formatIDRCompact(Number(amount)) : "—"}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{T.accountName}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>{T.currency}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="IDR">IDR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="panel p-2"><div className="text-muted-foreground">{T.currentBalance}</div><div className="font-medium">{active ? formatIDRCompact(Number(active.cash ?? 0)) : "—"}</div></div>
            <div className="panel p-2"><div className="text-muted-foreground">{T.equity}</div><div className="font-medium">{active ? formatIDRCompact(Number(active.equity ?? 0)) : "—"}</div></div>
            <div className="panel p-2"><div className="text-muted-foreground">{T.realizedPL}</div><div className="font-medium">{active ? formatIDRCompact(Number(active.realized_pnl ?? 0)) : "—"}</div></div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => setMut.mutate()} disabled={setMut.isPending || !amount}>
              {setMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />} {T.saveBalance}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline">{T.resetBtn}</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{T.resetTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{T.resetDesc}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="space-y-1.5">
                    <Label>{T.mode}</Label>
                    <Select value={resetMode} onValueChange={(v) => setResetMode(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balance_only">{T.modeBalanceOnly}</SelectItem>
                        <SelectItem value="reset_account">{T.modeResetAccount}</SelectItem>
                        <SelectItem value="new_account">{T.modeNewAccount}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{T.newBalance}</Label>
                    <Input type="number" value={resetAmount} onChange={e => setResetAmount(e.target.value)} />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>{T.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetMut.mutate()}>{T.confirmReset}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> {T.historyTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {!hist?.events?.length ? (
            <p className="text-sm text-muted-foreground">{T.historyEmpty}</p>
          ) : (
            <div className="space-y-1 text-xs">
              {hist.events.slice(0, 20).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between border-b border-border/40 py-1.5">
                  <div>
                    <span className="font-medium">{e.event_type}</span>
                    <span className="text-muted-foreground"> — {new Date(e.created_at).toLocaleString(localeForDate)}</span>
                    {e.reason && <div className="text-muted-foreground">{e.reason}</div>}
                  </div>
                  <div className="text-right">
                    {e.old_balance != null && <div className="text-muted-foreground">{T.from} {formatIDRCompact(Number(e.old_balance))}</div>}
                    {e.new_balance != null && <div>{T.to} {formatIDRCompact(Number(e.new_balance))}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
