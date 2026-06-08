import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Loader2, Languages } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp, isAuthenticated, loading } = useAuth();
  const { L, lang, setLang } = useLang();
  const A = L.authPage;
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
    if (error) toast.error(A.signInFail, { description: error });
    else { toast.success(A.signInOk); nav({ to: "/dashboard" }); }
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await signUp(email.trim(), password, fullName.trim() || undefined);
    setBusy(false);
    if (error) toast.error(A.signUpFail, { description: error });
    else {
      toast.success(A.signUpOk, { description: A.signUpOkDesc });
      // Try auto sign-in (works when email confirmation is disabled)
      const auto = await signIn(email.trim(), password);
      if (!auto.error) { nav({ to: "/dashboard" }); return; }
      setTab("login"); setPassword("");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-9 rounded-md bg-primary/15 grid place-items-center neon-border">
              <Activity className="size-5 text-primary" />
            </div>
            <span className="text-xl font-semibold tracking-tight">
              Quanta<span className="text-primary">.</span>Terminal
            </span>
          </Link>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            className="h-8 gap-1.5"
          >
            <Languages className="size-3.5" />
            {lang === "id" ? "🇮🇩 ID" : "🇬🇧 EN"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{A.welcome}</CardTitle>
            <CardDescription>{A.welcomeSub}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">{A.tabSignIn}</TabsTrigger>
                <TabsTrigger value="register" disabled={!registrationEnabled}>{A.tabSignUp}</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4 mt-4">
                <form onSubmit={onLogin} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-login">{A.email}</Label>
                    <Input id="email-login" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pwd-login">{A.password}</Label>
                    <Input id="pwd-login" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 mr-2 animate-spin" />} {A.btnSignIn}
                  </Button>
                  <div className="text-center text-xs">
                    <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">{A.forgotPassword}</Link>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="register" className="space-y-4 mt-4">
                {!registrationEnabled ? (
                  <p className="text-sm text-muted-foreground">{A.disabled}</p>
                ) : (
                  <form onSubmit={onRegister} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="name-reg">{A.fullName}</Label>
                      <Input id="name-reg" value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email-reg">{A.email}</Label>
                      <Input id="email-reg" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pwd-reg">{A.password}</Label>
                      <Input id="pwd-reg" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                      <p className="text-[11px] text-muted-foreground">{A.minChars}</p>
                    </div>
                    <Button type="submit" disabled={busy} className="w-full">
                      {busy && <Loader2 className="size-4 mr-2 animate-spin" />} {A.btnSignUp}
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      {A.disclaimer}
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
