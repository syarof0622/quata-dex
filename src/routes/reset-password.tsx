import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase parses recovery hash into a session on this page automatically.
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("Password tidak cocok"); return; }
    if (password.length < 8) { toast.error("Password minimal 8 karakter"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error("Gagal reset password", { description: error.message });
    else {
      // Clear must_change_password flag
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ must_change_password: false } as any).eq("id", user.id);
      toast.success("Password berhasil direset");
      nav({ to: "/dashboard" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>Buat password baru untuk akun Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-sm text-muted-foreground">Memverifikasi link reset…</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pwd">Password Baru</Label>
                <Input id="pwd" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pwd2">Konfirmasi Password</Label>
                <Input id="pwd2" type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />} Simpan Password Baru
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
