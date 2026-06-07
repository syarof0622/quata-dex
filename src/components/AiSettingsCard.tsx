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
import { useLang } from "@/hooks/use-language";

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
  const { L } = useLang();
  const T = L.body.aiSettings;
  const qc = useQueryClient();
  const get = useServerFn(getMyAiSettings);
  const upd = useServerFn(updateMyAiSettings);
  const { data, isLoading } = useQuery({ queryKey: ["my-ai-settings"], queryFn: () => get({}) });
  const [form, setForm] = useState<any>({});

  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data?.settings?.id]);

  const save = useMutation({
    mutationFn: async (payload: any) => upd({ data: payload }),
    onSuccess: () => { toast.success(T.saveOk); qc.invalidateQueries({ queryKey: ["my-ai-settings"] }); },
    onError: (e: any) => toast.error(T.saveFail, { description: e?.message }),
  });

  if (isLoading || !form) return <div className="text-sm text-muted-foreground">{T.loading}</div>;

  function set<K extends string>(k: K, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  const numericFields: Array<[string, string, number]> = [
    ["target_exposure_pct", T.targetExposure, 0.01],
    ["max_exposure_pct", T.maxExposure, 0.01],
    ["risk_per_trade_pct", T.riskPerTrade, 0.001],
    ["max_active_positions", T.maxActivePositions, 1],
    ["max_trades_per_day", T.maxTradesPerDay, 1],
    ["max_trades_per_symbol_per_week", T.maxTradesPerSymbolWeek, 1],
    ["min_trade_quality_score", T.minQualityScore, 1],
    ["min_risk_reward", T.minRR, 0.1],
    ["max_holding_days", T.maxHoldingDays, 1],
  ];

  const toggleFields: Array<[string, string]> = [
    ["use_swing_max", T.useSwingMax],
    ["use_recovery_mode", T.useRecovery],
    ["use_symbol_cooldown", T.useCooldown],
    ["use_strategy_kill_switch", T.useKillSwitch],
    ["use_trailing_stop", T.useTrailing],
    ["use_partial_take_profit", T.usePartialTP],
    ["allow_pyramiding", T.allowPyramiding],
    ["allow_average_down", T.allowAvgDown],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot className="size-4" /> {T.title}</CardTitle>
        <CardDescription>
          {T.desc} <Badge variant="outline" className="ml-1">{T.paperOnly}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between panel p-3">
          <div>
            <div className="font-medium text-sm">{T.enabled}</div>
            <div className="text-xs text-muted-foreground">{T.enabledHint}</div>
          </div>
          <Switch checked={!!form.ai_enabled} onCheckedChange={(v) => set("ai_enabled", v)} />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>{T.aiMode}</Label>
            <Select value={form.agent_mode} onValueChange={(v) => set("agent_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{T.allocationMode}</Label>
            <Select value={form.allocation_mode} onValueChange={(v) => set("allocation_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ALLOC.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{T.riskProfile}</Label>
            <Select value={form.risk_profile} onValueChange={(v) => set("risk_profile", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RISK.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {numericFields.map(([k, label, step]) => (
            <div key={k} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <Input type="number" step={step}
                value={form[k] ?? ""} onChange={e => set(k, Number(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {toggleFields.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between panel p-2.5">
              <span className="text-xs">{label}</span>
              <Switch checked={!!form[k]} onCheckedChange={(v) => set(k, v)} />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 mr-2 animate-spin" />} {T.saveBtn}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
