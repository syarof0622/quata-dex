import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/change-password")({ component: Page });

function Page() {
  const { user, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("Password tidak cocok"); return; }
    if (password.length < 8) { toast.error("Password minimal 8 karakter"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (!error && user) await supabase.from("profiles").update({ must_change_password: false } as any).eq("id", user.id);
    setBusy(false);
    if (error) toast.error("Gagal ubah password", { description: error.message });
    else { toast.success("Password berhasil diperbarui"); await refreshProfile(); nav({ to: "/dashboard" }); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Ubah Password</CardTitle>
          <CardDescription>Demi keamanan, Anda perlu menetapkan password baru sebelum melanjutkan.</CardDescription>
        </CardHeader>
        <CardContent>
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
              {busy && <Loader2 className="size-4 mr-2 animate-spin" />} Simpan Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
