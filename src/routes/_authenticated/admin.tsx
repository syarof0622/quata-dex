import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  listUsersAdmin, setUserStatusAdmin, setUserRoleAdmin,
  resetUserPasswordAdmin, getAppSettingsAdmin, updateAppSettingsAdmin,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck, KeyRound, UserX, UserCheck } from "lucide-react";

import { seoHead } from "@/lib/seo-head";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    ...seoHead({
      path: "/admin",
      title: "Admin — Quanta Terminal",
      description: "Administrative console for Quanta Terminal: user roles, system audits, and platform configuration.",
      noindex: true,
    }),
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && !isAdmin) nav({ to: "/dashboard" });
  }, [loading, isAdmin, nav]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Memuat…</div>;
  if (!isAdmin) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Kelola pengguna, peran, dan pengaturan global aplikasi.
        </p>
      </header>
      <AppSettingsPanel />
      <UsersPanel isSuperAdmin={isSuperAdmin} />
    </div>
  );
}

function AppSettingsPanel() {
  const getSettings = useServerFn(getAppSettingsAdmin);
  const updateSettings = useServerFn(updateAppSettingsAdmin);
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const r = await getSettings();
      setS(r.settings);
    } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { void load(); }, []);

  async function save(patch: any) {
    setSaving(true);
    try {
      await updateSettings({ data: patch });
      toast.success("Pengaturan tersimpan");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (!s) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Memuat pengaturan…</CardContent></Card>;

  return (
    <Card>
      <CardHeader><CardTitle>Pengaturan Global</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Registrasi Publik</Label>
            <p className="text-xs text-muted-foreground">Izinkan pengguna baru mendaftar tanpa undangan.</p>
          </div>
          <Switch
            checked={!!s.registration_enabled}
            onCheckedChange={(v) => save({ registration_enabled: v })}
            disabled={saving}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Saldo Awal Default (IDR)</Label>
            <Input
              type="number"
              defaultValue={s.default_starting_balance}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0 && v !== Number(s.default_starting_balance)) save({ default_starting_balance: v });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mode Agen AI Default</Label>
            <Input
              defaultValue={s.default_ai_agent_mode}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== s.default_ai_agent_mode) save({ default_ai_agent_mode: v });
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsersPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const listUsers = useServerFn(listUsersAdmin);
  const setStatus = useServerFn(setUserStatusAdmin);
  const setRole = useServerFn(setUserRoleAdmin);
  const resetPw = useServerFn(resetUserPasswordAdmin);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listUsers();
      setUsers(r.users ?? []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function act(label: string, fn: () => Promise<any>) {
    setBusy(label);
    try { await fn(); toast.success("Berhasil"); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pengguna ({users.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat pengguna…
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSuspended = u.status === "suspended";
              const isAdminUser = u.roles.includes("admin") || u.roles.includes("super_admin");
              const isSuper = u.roles.includes("super_admin");
              return (
                <div key={u.id} className="border border-border rounded-md p-3 flex flex-wrap gap-3 items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{u.display_name || u.full_name || u.email}</span>
                      {isSuper && <Badge variant="default">Super Admin</Badge>}
                      {!isSuper && u.roles.includes("admin") && <Badge variant="secondary">Admin</Badge>}
                      {isSuspended && <Badge variant="destructive">Suspended</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    {u.paper && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Saldo: {u.paper.currency} {Number(u.paper.cash).toLocaleString("id-ID")} ·
                        Equity: {u.paper.currency} {Number(u.paper.equity).toLocaleString("id-ID")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" disabled={!!busy || isSuper}
                      onClick={() => act(u.id + ":status", () =>
                        setStatus({ data: { userId: u.id, status: isSuspended ? "active" : "suspended" } }))}>
                      {isSuspended ? <><UserCheck className="size-4" /> Aktifkan</> : <><UserX className="size-4" /> Suspend</>}
                    </Button>
                    {isSuperAdmin && !isSuper && (
                      <Button size="sm" variant="outline" disabled={!!busy}
                        onClick={() => act(u.id + ":role", () =>
                          setRole({ data: { userId: u.id, role: "admin", grant: !u.roles.includes("admin") } }))}>
                        {u.roles.includes("admin")
                          ? <><ShieldAlert className="size-4" /> Cabut Admin</>
                          : <><ShieldCheck className="size-4" /> Jadikan Admin</>}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={!!busy}
                      onClick={() => {
                        const pw = prompt("Password baru (min 8 karakter):");
                        if (!pw || pw.length < 8) return;
                        void act(u.id + ":pw", () => resetPw({ data: { userId: u.id, newPassword: pw } }));
                      }}>
                      <KeyRound className="size-4" /> Reset Password
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
