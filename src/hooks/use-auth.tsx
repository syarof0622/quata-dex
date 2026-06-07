import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  status: string;
  must_change_password: boolean;
};

type Role = "user" | "admin" | "super_admin" | "suspended" | null;

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: Role;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  async function loadUserData(u: User | null) {
    if (!u) { setProfile(null); setRole(null); return; }
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id,email,display_name,full_name,status,must_change_password").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id),
      ]);
      setProfile((p as Profile) ?? null);
      const roles = (r ?? []).map((x: any) => x.role as string);
      if (roles.includes("super_admin")) setRole("super_admin");
      else if (roles.includes("admin")) setRole("admin");
      else if (roles.includes("suspended")) setRole("suspended");
      else if (roles.includes("user")) setRole("user");
      else setRole(null);
    } catch (e) {
      console.warn("[auth] loadUserData failed", e);
    }
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // Defer profile load to avoid deadlock inside callback
      setTimeout(() => { void loadUserData(s?.user ?? null); }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      void loadUserData(data.session?.user ?? null).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }

  async function signUp(email: string, password: string, fullName?: string) {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: redirectTo,
        data: fullName ? { full_name: fullName, display_name: fullName } : undefined,
      },
    });
    return error ? { error: error.message } : {};
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null); setUser(null); setProfile(null); setRole(null);
  }

  async function refreshProfile() { await loadUserData(user); }

  const isAuthenticated = !!user;
  const isAdmin = role === "admin" || role === "super_admin";
  const isSuperAdmin = role === "super_admin";

  return (
    <Ctx.Provider value={{
      user, session, profile, role, loading,
      isAuthenticated, isAdmin, isSuperAdmin,
      signIn, signUp, signOut, refreshProfile,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
