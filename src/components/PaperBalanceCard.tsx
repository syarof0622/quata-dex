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

export function PaperBalanceCard() {
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
      setName(active.account_name ?? "Akun Paper Trading Utama");
      setCurrency((active.currency as any) ?? "IDR");
    }
  }, [active?.id]);

  const setMut = useMutation({
    mutationFn: async () => setBal({ data: { starting_balance: Number(amount), account_name: name, currency }}),
    onSuccess: () => { toast.success("Saldo paper trading diperbarui"); qc.invalidateQueries({ queryKey: ["my-paper"] }); qc.invalidateQueries({ queryKey: ["my-balance-history"] }); },
    onError: (e: any) => toast.error("Gagal", { description: e?.message }),
  });

  const resetMut = useMutation({
    mutationFn: async () => reset({ data: { mode: resetMode, starting_balance: Number(resetAmount) }}),
    onSuccess: () => { toast.success("Akun paper berhasil di-reset"); qc.invalidateQueries({ queryKey: ["my-paper"] }); qc.invalidateQueries({ queryKey: ["my-balance-history"] }); },
    onError: (e: any) => toast.error("Gagal reset", { description: e?.message }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Memuat akun paper…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="size-4" /> Atur Saldo Paper Trading</CardTitle>
          <CardDescription>
            Saldo virtual untuk simulasi. <Badge variant="outline" className="ml-1">Paper Trading Only</Badge> — tidak ada uang sungguhan, tidak terhubung ke broker.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Saldo Awal</Label>
              <Input type="number" min={1000} step={1000} value={amount} onChange={e => setAmount(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">{amount ? formatIDRCompact(Number(amount)) : "—"}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Nama Akun</Label>
              <Input value={name} onChange={e => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>Mata Uang</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="IDR">IDR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="panel p-2"><div className="text-muted-foreground">Saldo Saat Ini</div><div className="font-medium">{active ? formatIDRCompact(Number(active.cash ?? 0)) : "—"}</div></div>
            <div className="panel p-2"><div className="text-muted-foreground">Equity</div><div className="font-medium">{active ? formatIDRCompact(Number(active.equity ?? 0)) : "—"}</div></div>
            <div className="panel p-2"><div className="text-muted-foreground">Realized P/L</div><div className="font-medium">{active ? formatIDRCompact(Number(active.realized_pnl ?? 0)) : "—"}</div></div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => setMut.mutate()} disabled={setMut.isPending || !amount}>
              {setMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />} Simpan Saldo
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline">Reset Saldo / Akun</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Akun Paper</AlertDialogTitle>
                  <AlertDialogDescription>
                    Pilih mode reset. Hanya mempengaruhi akun paper Anda sendiri.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="space-y-1.5">
                    <Label>Mode</Label>
                    <Select value={resetMode} onValueChange={(v) => setResetMode(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balance_only">Reset Saldo Saja (baseline baru, histori dipertahankan)</SelectItem>
                        <SelectItem value="reset_account">Reset Akun (arsipkan, mulai dari nol)</SelectItem>
                        <SelectItem value="new_account">Buat Akun Paper Baru</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Saldo Baru</Label>
                    <Input type="number" value={resetAmount} onChange={e => setResetAmount(e.target.value)} />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetMut.mutate()}>Konfirmasi Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> Riwayat Perubahan Saldo</CardTitle>
        </CardHeader>
        <CardContent>
          {!hist?.events?.length ? (
            <p className="text-sm text-muted-foreground">Belum ada perubahan tercatat.</p>
          ) : (
            <div className="space-y-1 text-xs">
              {hist.events.slice(0, 20).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between border-b border-border/40 py-1.5">
                  <div>
                    <span className="font-medium">{e.event_type}</span>
                    <span className="text-muted-foreground"> — {new Date(e.created_at).toLocaleString("id-ID")}</span>
                    {e.reason && <div className="text-muted-foreground">{e.reason}</div>}
                  </div>
                  <div className="text-right">
                    {e.old_balance != null && <div className="text-muted-foreground">dari {formatIDRCompact(Number(e.old_balance))}</div>}
                    {e.new_balance != null && <div>ke {formatIDRCompact(Number(e.new_balance))}</div>}
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
