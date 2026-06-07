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
import { useLang } from "@/hooks/use-language";

export function OnboardingDialog() {
  const { L } = useLang();
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
          <DialogTitle>{L.onboarding.title}</DialogTitle>
          <DialogDescription>{L.onboarding.description}</DialogDescription>
        </DialogHeader>
        <ul className="text-sm list-disc pl-5 space-y-1 text-muted-foreground">
          {L.onboarding.features.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={skip}>
            {L.onboarding.skip}
          </Button>
          <Button disabled={busy} onClick={startDemo}>
            {busy ? L.onboarding.preparing : L.onboarding.start}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
