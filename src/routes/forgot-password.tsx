import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({ component: Page });

function Page() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    if (error) toast.error("Gagal mengirim email reset", { description: error.message });
    else { setSent(true); toast.success("Email reset terkirim"); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Lupa Password</CardTitle>
          <CardDescription>Masukkan email akun Anda. Kami akan mengirim link untuk reset password.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-3 text-sm">
              <p>Cek inbox Anda untuk link reset password. Link berlaku terbatas waktu.</p>
              <Button asChild variant="outline" className="w-full"><Link to="/auth">Kembali ke Login</Link></Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />} Kirim Link Reset
              </Button>
              <Button asChild variant="ghost" className="w-full"><Link to="/auth">Kembali</Link></Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
