## Konteks

Saat ini Quanta Terminal **single-tenant**: `src/hooks/use-auth.tsx` mengembalikan UUID hardcoded `00000000-…-0001`, dan semua RLS pada ~25 tabel di-scope ke konstanta itu lewat role `public`. Tidak ada Supabase Auth aktif. Cron AI Agent jalan untuk satu user.

Setelah migrasi ini:
- Semua data lama (paper account, AI agents, posisi, watchlist, journal, dll) **dipindah ke Super Admin** `assist@uinws.or.id`.
- Setiap user baru dapat paper account Rp 100 jt + setting default + role `user`.
- Cron AI Agent **loop semua user** yang `automation_enabled = true`.
- Registrasi publik **terbuka**.

## Yang akan dibangun

### Database (1 migration besar)

Tabel baru:
- `app_role` enum: `super_admin`, `admin`, `user`, `suspended`
- `profiles` — 1:1 dengan `auth.users`, kolom: email, username (unique), full_name, display_name, avatar_url, status, must_change_password
- `user_roles` — tabel terpisah (anti privilege escalation), unique(user_id, role)
- `user_settings` — language, theme, timezone, currency, risk_profile, ai_agent_mode
- `user_audit_logs` — actor_user_id, target_user_id, action, details (jsonb)
- `app_settings` — single-row key/value untuk `registration_enabled`, `default_starting_balance`, dll

Helper SECURITY DEFINER (anti-recursion):
- `has_role(_user_id uuid, _role app_role) returns boolean`
- `is_admin(_user_id uuid) returns boolean` (super_admin OR admin)
- `current_user_role() returns app_role`

Trigger `handle_new_user()` (AFTER INSERT ON auth.users):
- buat `profiles` row dengan email dari NEW
- assign role `user` di `user_roles`
- buat `user_settings` default
- buat `paper_accounts` default Rp 100 jt IDR, nama "Akun Paper Trading Utama"

Migrasi data lama:
- `UPDATE` semua tabel user-scoped: ganti `user_id = '00000000-…-0001'` jadi user_id Super Admin (di-resolve runtime via subquery `profiles WHERE email='assist@uinws.or.id'`)
- karena Super Admin belum ada sebelum bootstrap, migration **menyimpan UUID lama dulu**, dan bootstrap route nanti yang me-reassign.

RLS rewrite (drop semua policy lama, buat baru):
- User-owned tables (`paper_accounts`, `paper_positions`, `paper_orders`, `paper_trades`, `closed_trades`, `watchlists`, `alerts`, `ai_agents`, `ai_decisions`, `ai_decision_replay`, `trading_journal`, `backtest_results`, `simulation_results`, `portfolio_snapshots`, `position_exit_plans`, `swing_trade_plans`, `strategy_mode_performance_snapshots`, `user_settings`): policy `user_id = auth.uid() OR public.is_admin(auth.uid())`. GRANT pindah dari `public` ke `authenticated` + `service_role`.
- Global tables (`market_prices`, `news_articles`, `source_health`, `stock_fundamentals`, `sector_rotation`, `market_regime`, dll): policy SELECT untuk `authenticated`, write hanya `service_role`.
- `profiles`: user bisa SELECT/UPDATE row sendiri (tapi kolom `email`, `username`, `display_name` saja — pakai trigger BEFORE UPDATE untuk blok perubahan kolom sistem). Admin/super_admin SELECT/UPDATE semua.
- `user_roles`: SELECT untuk authenticated (lihat role sendiri); INSERT/UPDATE/DELETE hanya super_admin (admin tidak bisa promote diri/orang lain ke super_admin).

### Bootstrap Super Admin (server route)

`POST /api/public/auth/bootstrap-superadmin` (idempotent):
- pakai `supabaseAdmin.auth.admin.createUser` dengan email `assist@uinws.or.id`, password `dudududu`, `email_confirm: true`
- jika user sudah ada: lewati create, hanya pastikan role
- UPSERT profile dengan `must_change_password = true`, display_name "Super Admin"
- INSERT role `super_admin` ke `user_roles`
- **Reassign data lama**: UPDATE semua tabel set `user_id = <super admin id>` WHERE `user_id = '00000000-…-0001'`
- Password tidak pernah di-log atau dikirim ke client; tersimpan di server route file.

Route dipanggil sekali otomatis dari migration via `pg_net`, atau manual via curl. Saya akan trigger sekali setelah deploy.

### Auth UI (route publik baru)

`src/routes/auth/login.tsx`, `auth/register.tsx`, `auth/change-password.tsx`, `auth/forgot-password.tsx`, `auth/reset-password.tsx`:
- styling sesuai PageHero / panel existing (dark fintech)
- form `<Input>` + `<Button>` dari shadcn
- semua label/error Bahasa Indonesia ("Masuk", "Daftar", "Kata Sandi salah", "Email sudah terdaftar", dll)
- responsif mobile

`src/hooks/use-auth.tsx`: rewrite total
- `onAuthStateChange` listener
- `signIn(email, password)`, `signUp(email, password, fullName)`, `signOut()`
- expose `user`, `profile`, `role`, `isLoading`, `isAdmin`, `isSuperAdmin`

`src/integrations/supabase/auth-attacher.ts` + register di `src/start.ts` `functionMiddleware`.

### Route gating

- Pastikan `src/routes/_authenticated/route.tsx` (integration-managed) — kalau belum ada bentuk yang benar, biarkan integrasi yang generate; saya hanya pastikan child routes tetap di subtree itu.
- Pindahkan `src/routes/_authenticated.tsx` lama (kalau ada konflik) ke skema yang benar.
- Tambah `_authenticated/admin.tsx` dengan `beforeLoad` check `isAdmin` via context.

### Admin dashboard `/admin`

`src/routes/_authenticated/admin.tsx`:
- Tab "Pengguna": tabel responsif (search by email/username, filter role/status), action: ubah role, suspend/aktifkan, reset paper account, lihat audit log.
- Tab "Sistem": embed komponen system health yang sudah ada.
- Tab "Audit": list `user_audit_logs` dengan filter.
- Tab "Pengaturan App": toggle `registration_enabled`, edit default starting balance & AI Agent mode.

ServerFn admin (`src/lib/admin.functions.ts`) dengan `requireSupabaseAuth` + cek `is_admin()`:
- `listUsers`, `updateUserRole` (block: admin tidak bisa ubah super_admin), `updateUserStatus`, `resetUserPaperAccount`, `listAuditLogs`, `getAppSettings`, `updateAppSettings`.

### Force password change

- Halaman `auth/change-password.tsx`
- Setelah login, kalau `profile.must_change_password === true`, root layout redirect ke halaman itu (kecuali sudah di halaman tsb).
- Saat update sukses: set `must_change_password = false` lewat serverFn.

### Refactor serverFns existing (besar)

Semua file di `src/lib/*.functions.ts` yang baca/tulis tabel user-scoped harus pakai `requireSupabaseAuth` dan `context.userId` alih-alih konstanta. File yang harus disentuh (estimasi):

```text
paper.functions.ts          ai-agents.functions.ts      watchlist.functions.ts
alerts.functions.ts         portfolio.functions.ts      portfolio-attribution.functions.ts
journal.functions.ts        simulation.functions.ts     backtest.functions.ts
swing-plan.functions.ts     exit-plan.functions.ts      autonomous-status.functions.ts
ai-trade-agent.functions.ts ai-analyst.functions.ts     decision-replay.functions.ts
```

Pendekatan: ganti tiap `eq("user_id", "00000000-…-0001")` dengan `eq("user_id", context.userId)`, tambah `.middleware([requireSupabaseAuth])`.

ServerFns yang dipakai cron / worker (`ai-agent-worker.server.ts`, `news-pipeline-runner.server.ts`, dll) tetap pakai `supabaseAdmin` dan **loop semua user dengan `ai_agents.automation_enabled = true`** alih-alih satu UUID.

### Cron / worker update

Worker AI Agent yang dipanggil cron:
1. `SELECT DISTINCT user_id FROM ai_agents WHERE automation_enabled = true AND user_id IN (SELECT user_id FROM user_roles WHERE role != 'suspended')`
2. Untuk tiap user, jalankan loop keputusan existing.
3. Log per-user di `worker_runs`.

### Memori

Update `mem://index.md`: hapus core rule "single-tenant hardcoded UUID", ganti dengan "Multi-user via Supabase Auth, RLS via auth.uid() + user_roles.has_role(). Super Admin: assist@uinws.or.id."

## Detail teknis

### File yang dibuat / disentuh

**Baru (~15 file):**
- 1 migration SQL besar
- `src/routes/auth/login.tsx`, `register.tsx`, `change-password.tsx`, `forgot-password.tsx`, `reset-password.tsx`
- `src/routes/_authenticated/admin.tsx`
- `src/routes/api/public/auth/bootstrap-superadmin.ts`
- `src/lib/admin.functions.ts`
- `src/lib/profile.functions.ts`
- `src/lib/app-settings.functions.ts`
- `src/integrations/supabase/auth-attacher.ts` (jika belum)
- `src/components/ForcePasswordChangeGate.tsx`
- `src/components/AdminUserTable.tsx`

**Diubah (~20+ file):**
- `src/hooks/use-auth.tsx` (rewrite total)
- `src/start.ts` (tambah `attachSupabaseAuth` ke functionMiddleware)
- `src/routes/__root.tsx` (auth listener)
- `src/routes/_authenticated.tsx` atau `_authenticated/route.tsx` (sesuai integration)
- Semua `*.functions.ts` user-scoped (15+ file)
- `src/components/MobileBottomNav.tsx`, sidebar di `_authenticated.tsx` (link logout, /admin)
- `src/routes/_authenticated/settings.tsx` (section Profile + ganti password)
- Worker files (loop multi-user)

### Risiko & mitigasi

- **Risiko 1**: Tipe Supabase belum regenerate setelah migration → kode TS error. Mitigasi: migration approve dulu, baru tulis kode app.
- **Risiko 2**: RLS recursion di profiles → pakai `is_admin()` SECURITY DEFINER, bukan subquery di policy.
- **Risiko 3**: Data lama hilang. Mitigasi: bootstrap route melakukan reassign idempotent; sebelum reassign, INSERT INTO `user_audit_logs` snapshot count per tabel.
- **Risiko 4**: Cron lama crash karena UUID hardcoded sudah tidak relevan. Mitigasi: worker di-update di turn ini juga.

### Urutan eksekusi turn ini

1. **Migration** (saya kirim, user approve) → tabel + RLS + trigger + helpers (TANPA reassign data dulu).
2. Tulis bootstrap route + serverFn admin + auth-attacher + use-auth rewrite + halaman auth UI + admin dashboard + refactor functions + update worker — semua paralel batch besar.
3. Setelah build hijau, panggil bootstrap route sekali untuk create Super Admin + reassign data.
4. Smoke test: login Super Admin → harus diminta ganti password → setelah ganti, dashboard normal dengan data lama.
5. Update `mem://index.md`.

### Yang TIDAK dilakukan (eksplisit)

- Tidak menyentuh logika paper trading, AI agent decision engine, risk engine, momentum hunter — hanya routing data per-user.
- Tidak ganti UI dashboard / portfolio / chart / news existing.
- Tidak tambah broker / real money.
- Tidak hapus fitur apapun.

## Estimasi

~25-30 tool call dalam turn ini (migration + multi-file write paralel + verify). Setelah selesai, ada kemungkinan 1-2 turn follow-up untuk fix regresi kecil di serverFn yang kelewat.

Setujui untuk saya mulai dengan migration?
