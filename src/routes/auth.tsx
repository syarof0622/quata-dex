import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp, isAuthenticated, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    if (!loading && isAuthenticated) nav({ to: "/dashboard" });
  }, [loading, isAuthenticated, nav]);

  useEffect(() => {
    supabase.from("app_settings").select("registration_enabled").eq("id", true).maybeSingle()
      .then(({ data }) => { if (data) setRegistrationEnabled(!!data.registration_enabled); });
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) toast.error("Gagal login", { description: error });
    else { toast.success("Berhasil login"); nav({ to: "/dashboard" }); }
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await signUp(email.trim(), password, fullName.trim() || undefined);
    setBusy(false);
    if (error) toast.error("Gagal mendaftar", { description: error });
    else {
      toast.success("Akun berhasil dibuat", { description: "Silakan login dengan email & password Anda." });
      setTab("login"); setPassword("");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-6 justify-center">
          <div className="size-9 rounded-md bg-primary/15 grid place-items-center neon-border">
            <Activity className="size-5 text-primary" />
          </div>
          <span className="text-xl font-semibold tracking-tight">
            Quanta<span className="text-primary">.</span>Terminal
          </span>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Selamat datang</CardTitle>
            <CardDescription>Masuk atau daftar untuk mengakses Quanta Terminal — paper trading only.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Masuk</TabsTrigger>
                <TabsTrigger value="register" disabled={!registrationEnabled}>Daftar</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4 mt-4">
                <form onSubmit={onLogin} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-login">Email</Label>
                    <Input id="email-login" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pwd-login">Password</Label>
                    <Input id="pwd-login" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 mr-2 animate-spin" />} Masuk
                  </Button>
                  <div className="text-center text-xs">
                    <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">Lupa password?</Link>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="register" className="space-y-4 mt-4">
                {!registrationEnabled ? (
                  <p className="text-sm text-muted-foreground">Registrasi publik sedang dinonaktifkan oleh admin.</p>
                ) : (
                  <form onSubmit={onRegister} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="name-reg">Nama Lengkap</Label>
                      <Input id="name-reg" value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email-reg">Email</Label>
                      <Input id="email-reg" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pwd-reg">Password</Label>
                      <Input id="pwd-reg" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                      <p className="text-[11px] text-muted-foreground">Minimal 8 karakter.</p>
                    </div>
                    <Button type="submit" disabled={busy} className="w-full">
                      {busy && <Loader2 className="size-4 mr-2 animate-spin" />} Buat Akun
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Dengan mendaftar, Anda setuju bahwa Quanta Terminal adalah aplikasi paper trading edukasi tanpa transaksi uang sungguhan.
                    </p>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
