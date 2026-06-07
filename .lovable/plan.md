## Tujuan

Mengganti string Bahasa Indonesia hard-coded di seluruh halaman dengan `useLang().L.*` sehingga toggle **System Language** di Settings benar-benar mengubah seluruh UI.

## Strategi

Migrasi per-batch, satu turn per batch. Setiap batch: (1) tambah key yang diperlukan ke `id.ts` + `en.ts`, (2) ubah komponen untuk membaca dari `useLang()`, (3) verifikasi tidak ada regresi.

Setelah setiap batch saya berhenti dan minta konfirmasi sebelum lanjut — jadi Anda bisa cek hasilnya halaman demi halaman.

## Urutan Batch

**Batch 1 — Shell & navigasi global** (paling visible, ROI tertinggi)
- `_authenticated.tsx` — header "Markets · live", tooltip "Sign out", label "Memuat sesi…"
- `MobileBottomNav.tsx` — "More", "Sign out", `SheetTitle`
- `OnboardingDialog.tsx`
- `FloatingAIChat.tsx` — placeholder, header, tombol
- `PageHero` consumers (eyebrow/title/subtitle) untuk semua halaman utama

**Batch 2 — Halaman utama (read-heavy)**
- `dashboard.tsx`
- `market.tsx`
- `watchlist.tsx`
- `portfolio.tsx`
- `news.tsx` (juga sinkron filter bahasa)

**Batch 3 — Halaman tools**
- `screener.tsx`
- `ai.tsx`
- `lab.tsx`
- `expert.tsx`
- `alerts.tsx`

**Batch 4 — Settings, Health, Admin, Auth**
- `settings.tsx` (sisa tab: Profile, Trading, Notifications, Data)
- `health.tsx`
- `admin.tsx`
- `auth.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `change-password.tsx`

**Batch 5 — Komponen panel besar**
- `AiSettingsCard`, `PaperBalanceCard`, `AutonomousAgentPanel`, `AiInsightsPanel`, `JournalPanel`, `RiskEnginePanel`, `FundamentalPanel`, `PortfolioIntelligencePanel`, `PortfolioAttributionPanel`, `ChatPanel`, `DecisionReplay`, badges

## Aturan migrasi

1. Tambahkan key ke kedua kamus (`id.ts` & `en.ts`) dengan struktur identik. Jika perlu kategori baru, tambah di kedua file pada urutan yang sama.
2. Ganti string literal → `L.<kategori>.<key>`. Untuk teks dinamis pakai template literal atau helper `format(L.x, { name })` (akan ditambah jika perlu).
3. JANGAN ubah nama variabel internal, API key, enum DB, atau label `lucide-react` icon — hanya teks user-facing.
4. Toast & error messages dari server tetap dalam bahasa aslinya (tidak diterjemah) — sebutkan ini sebagai limitation.
5. Setelah tiap batch: smoke check via preview — toggle ID↔EN, klik halaman yang baru dimigrasi, pastikan tidak ada `undefined` di UI.

## Mulai sekarang

Saya kerjakan **Batch 1** dulu (shell + navigasi + PageHero), lalu berhenti untuk Anda cek hasilnya di preview. Lanjut?
