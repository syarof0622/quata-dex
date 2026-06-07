import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot } from "lucide-react";
import { toast } from "sonner";
import { getMyAiSettings, updateMyAiSettings } from "@/lib/ai-settings.functions";

const MODES = [
  { v: "conservative", l: "Conservative" },
  { v: "balanced", l: "Balanced" },
  { v: "progressive", l: "Progressive" },
  { v: "swing_max", l: "Swing Max" },
  { v: "recovery_swing_max", l: "Recovery Swing Max" },
  { v: "research_max", l: "Research Max" },
];
const ALLOC = [
  { v: "conservative", l: "Conservative" },
  { v: "balanced", l: "Balanced" },
  { v: "high_conviction_swing", l: "High Conviction Swing" },
];
const RISK = [
  { v: "low", l: "Low" }, { v: "medium", l: "Medium" }, { v: "balanced", l: "Balanced" }, { v: "high", l: "High" },
];

export function AiSettingsCard() {
  const qc = useQueryClient();
  const get = useServerFn(getMyAiSettings);
  const upd = useServerFn(updateMyAiSettings);
  const { data, isLoading } = useQuery({ queryKey: ["my-ai-settings"], queryFn: () => get({}) });
  const [form, setForm] = useState<any>({});

  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data?.settings?.id]);

  const save = useMutation({
    mutationFn: async (payload: any) => upd({ data: payload }),
    onSuccess: () => { toast.success("Pengaturan Agen AI disimpan"); qc.invalidateQueries({ queryKey: ["my-ai-settings"] }); },
    onError: (e: any) => toast.error("Gagal menyimpan", { description: e?.message }),
  });

  if (isLoading || !form) return <div className="text-sm text-muted-foreground">Memuat pengaturan AI…</div>;

  function set<K extends string>(k: K, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot className="size-4" /> Pengaturan Agen AI</CardTitle>
        <CardDescription>
          Konfigurasi Agen AI khusus untuk akun Anda. <Badge variant="outline" className="ml-1">Paper Trading Only</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between panel p-3">
          <div>
            <div className="font-medium text-sm">Agen AI Aktif</div>
            <div className="text-xs text-muted-foreground">Jika dimatikan, agen tidak akan membuat keputusan otomatis untuk akun Anda.</div>
          </div>
          <Switch checked={!!form.ai_enabled} onCheckedChange={(v) => set("ai_enabled", v)} />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Mode AI</Label>
            <Select value={form.agent_mode} onValueChange={(v) => set("agent_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode Alokasi</Label>
            <Select value={form.allocation_mode} onValueChange={(v) => set("allocation_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ALLOC.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Profil Risiko</Label>
            <Select value={form.risk_profile} onValueChange={(v) => set("risk_profile", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RISK.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {[
            ["target_exposure_pct", "Target Eksposur (0-1)", 0.01],
            ["max_exposure_pct", "Eksposur Maksimal (0-1)", 0.01],
            ["risk_per_trade_pct", "Risiko per Transaksi (0-1)", 0.001],
            ["max_active_positions", "Maksimal Posisi Aktif", 1],
            ["max_trades_per_day", "Maksimal Trade per Hari", 1],
            ["max_trades_per_symbol_per_week", "Maks Trade per Emiten/Minggu", 1],
            ["min_trade_quality_score", "Skor Kualitas Minimum", 1],
            ["min_risk_reward", "Risk/Reward Minimum", 0.1],
            ["max_holding_days", "Maks Hari Tahan Posisi", 1],
          ].map(([k, label, step]) => (
            <div key={k as string} className="space-y-1.5">
              <Label className="text-xs">{label as string}</Label>
              <Input type="number" step={step as number}
                value={form[k as string] ?? ""} onChange={e => set(k as string, Number(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {[
            ["use_swing_max", "Aktifkan Swing Max"],
            ["use_recovery_mode", "Aktifkan Recovery Mode"],
            ["use_symbol_cooldown", "Jeda Emiten (Symbol Cooldown)"],
            ["use_strategy_kill_switch", "Penghenti Strategi Rugi"],
            ["use_trailing_stop", "Trailing Stop"],
            ["use_partial_take_profit", "Take Profit Bertahap"],
            ["allow_pyramiding", "Izinkan Pyramiding (hanya setelah profit)"],
            ["allow_average_down", "Izinkan Average Down"],
          ].map(([k, label]) => (
            <div key={k as string} className="flex items-center justify-between panel p-2.5">
              <span className="text-xs">{label as string}</span>
              <Switch checked={!!form[k as string]} onCheckedChange={(v) => set(k as string, v)} />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 mr-2 animate-spin" />} Simpan Pengaturan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
