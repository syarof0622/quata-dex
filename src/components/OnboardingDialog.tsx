// Phase E: simple first-run onboarding with demo seed.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getDemoStatus,
  completeOnboarding,
  seedDefaultWatchlist,
  setDemoMode,
} from "@/lib/demo-mode.functions";

export function OnboardingDialog() {
  const fetchStatus = useServerFn(getDemoStatus);
  const finish = useServerFn(completeOnboarding);
  const seed = useServerFn(seedDefaultWatchlist);
  const setDemo = useServerFn(setDemoMode);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchStatus().then((s: any) => {
      if (!alive) return;
      if (!s?.onboarding_completed) setOpen(true);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetchStatus]);

  async function startDemo() {
    setBusy(true);
    try {
      await setDemo({ data: { enabled: true } });
      await seed();
      await finish();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await finish();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Selamat datang — mulai dalam mode Demo?</DialogTitle>
          <DialogDescription>
            Demo mode mengisi watchlist default (BBCA, BBRI, TLKM, ASII, GOTO,
            ANTM, UNVR, MDKA) dan menyalakan paper trading. Semua data adalah
            data pasar nyata, namun eksekusi tetap simulasi — tidak ada uang
            sungguhan. Anda bisa mematikannya kapan saja.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-sm list-disc pl-5 space-y-1 text-muted-foreground">
          <li>AI Trade Agent + Autonomous Scanner</li>
          <li>Screener teknikal & fundamental (undervalued)</li>
          <li>Market Regime, Sector Rotation, Portfolio Risk</li>
          <li>Post-trade Review & Lessons Learned</li>
          <li>Multi-factor AI alerts</li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={skip}>
            Lewati
          </Button>
          <Button disabled={busy} onClick={startDemo}>
            {busy ? "Menyiapkan…" : "Mulai Demo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
