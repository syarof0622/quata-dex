# Project Memory

## Core
Multi-user app on Supabase Auth. All user-scoped RLS uses `auth.uid()` + `public.is_admin()`. Roles in `user_roles` (never on profiles). Super Admin: assist@uinws.or.id (bootstrap via `POST /api/public/auth/bootstrap-superadmin`). Paper trading only — no broker, no real money.
Server fns use `requireSupabaseAuth` for new code; legacy files use `currentUserId()` from `@/lib/current-user.server` (populated by `withCurrentUser` global function middleware in `src/start.ts`). Cron worker `/api/public/cron/ai-agent` iterates active agents and wraps `runAgentOnce(agentId)` in `runAsUser(agent.user_id, ...)` so per-user helpers resolve the right uid.
Admin dashboard at `/admin` (gated by `isAdmin` in `useAuth`) uses `src/lib/admin.functions.ts` (assertAdmin via service-role check) for user list, status, role grants (super_admin only can promote admins), password reset, and global app_settings.

## Memories
- [Security posture](mem://security) — Auth model, roles, super admin bootstrap, AI worker per-user requirement
