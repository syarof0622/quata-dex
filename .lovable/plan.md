## Rencana Lanjutan Quanta Terminal

### 1. Ingest project dari ZIP

- Ekstrak seluruh isi `Watchlist_Fix_Connect_1.zip` ke project (overwrite template kosong saat ini): `src/`, `supabase/`, `package.json`, `vite.config.ts`, `tsconfig.json`, `components.json`, `wrangler.jsonc`, `.env`, dll.
- Install dependency dari `package.json` upload (yahoo-finance2, lightweight-charts, framer-motion, recharts, react-markdown, vaul, embla, supabase-js, dsb).
- `routeTree.gen.ts` akan diregenerasi otomatis oleh TanStack Vite plugin saat dev start.

### 2. Koneksi database

- `.env` upload menunjuk ke Supabase eksternal Anda (`rrqzcgnxuyfmcnmwyajj.supabase.co`) — saya pertahankan apa adanya, **tidak** mengaktifkan Lovable Cloud baru (akan membuat project Supabase berbeda dan memutus data Anda).
- Verifikasi `client.ts` / `client.server.ts` membaca env yang benar; pastikan migration di `supabase/migrations/` sudah ter-apply di project Anda (asumsi sudah, karena project sebelumnya dipakai). Jika ada server function 401/relasi hilang akan saya laporkan.

### 3. Seed super admin `dududu@dududu.com / dududu`

Untuk membuat user di Supabase eksternal saya butuh **SERVICE_ROLE_KEY** project tersebut (tidak ada di `.env` yang Anda upload, hanya anon/publishable key). Dua opsi — saya akan minta konfirmasi sebelum lanjut:

- **(A)** Anda menambahkan secret `SUPABASE_SERVICE_ROLE_KEY` lewat tool secret → saya jalankan script seed (admin createUser + insert role `super_admin` di tabel `user_roles`, atau buat tabelnya dulu jika belum ada).
- **(B)** Anda buat manual via Supabase dashboard (Auth → Add user) lalu saya tinggal pastikan role tabel terisi.
- Jika belum ada tabel `user_roles` + enum `app_role`, saya buat migration baru sesuai pola RLS aman (security-definer `has_role`).

### 4. Fitur lanjutan

**a. Fundamental tab lengkap (`/chart/$symbol`)**

- Tambah tab "Fundamental" lengkap di samping Chart/Signals/News yang sudah ada. Server function `getFundamentals` baru pakai `yahoo-finance2` modules: `summaryDetail`, `defaultKeyStatistics`, `financialData`, `assetProfile`, `incomeStatementHistory`, `balanceSheetHistory`, `cashflowStatementHistory`, `earnings`.
- Section UI: Company Profile, Valuation (PE/PB/PS/EV-EBITDA), Profitability (ROE/ROA/Margins), Growth (Revenue/EPS YoY), Financial Health (Debt/Equity, Current Ratio), Dividends, Earnings calendar, Income/Balance/Cashflow ringkas (3 tahun terakhir, table).
- Loading skeleton + empty-state per section, format angka via `lib/format.ts`.

**b. Microcopy screener "Volx → Relative Volume"**

- Di `/screener`: rename label kolom & filter "Volx" menjadi "Relative Volume" (tooltip: "Volume hari ini ÷ rata-rata 20 hari"). Sertakan singkatan "(RVOL)" agar trader tetap kenal.
- Update header tabel, filter sidebar, dan teks bantuan terkait.

**c. Responsive collapsible panel**

- Convert panel samping (watchlist/journal/chat sidebar) jadi `Collapsible` (shadcn) dengan tombol toggle dan default state berdasar breakpoint via `useIsMobile`.
- Mobile (<md): default collapsed, buka sebagai `Sheet` (drawer kiri/kanan).
- Desktop (≥md): default expanded, bisa di-collapse jadi rail tipis ikon-only (mirip `SidebarTrigger`). State disimpan di `localStorage`.
- Konten utama otomatis melebar saat panel collapsed (grid responsive `grid-cols-[auto_1fr]`).

### 5. Verifikasi

- Build harness jalan; fix TS/import errors.
- Manual: login → buka `/chart/AAPL` cek tab Fundamental → buka `/screener` cek label RVOL → resize viewport cek collapsible panel mobile/desktop.

### Catatan teknis

- Worker runtime kompatibel dengan `yahoo-finance2` (fetch-based, no native deps).
- `LOVABLE_API_KEY` untuk `api/chat.ts` akan saya cek; jika belum ada saya minta via add_secret.
- Saya **tidak** menyentuh data existing di Supabase Anda; hanya menambah tabel `user_roles` (jika belum ada) dan satu user baru.

### Pertanyaan sebelum eksekusi

1. Untuk seed super admin: pilih (A) saya minta `SUPABASE_SERVICE_ROLE_KEY` via secret, atau (B) Anda buat user manual di dashboard?
2. Konfirmasi tetap pakai Supabase eksternal `rrqzcgnxuyfmcnmwyajj` (bukan Lovable Cloud baru)?