import { createContext, useContext, type ReactNode } from "react";

const SUPER_ADMIN = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "superadmin@quanta.local",
  user_metadata: { display_name: "Super Admin" },
  app_metadata: { role: "super_admin" },
} as any;

type AuthCtx = {
  user: typeof SUPER_ADMIN;
  session: { user: typeof SUPER_ADMIN } | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: SUPER_ADMIN,
  session: { user: SUPER_ADMIN },
  loading: false,
  isSuperAdmin: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <Ctx.Provider value={{
      user: SUPER_ADMIN,
      session: { user: SUPER_ADMIN },
      loading: false,
      isSuperAdmin: true,
      signOut: async () => {},
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
