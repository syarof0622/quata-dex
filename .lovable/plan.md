# News & Market Sentiment Aggregator

Membangun agregator berita & sentimen pasar saham Indonesia dari beberapa sumber RSS gratis (Kontan, CNBC, ANTARA, Investor.id, Google News) dengan fallback, normalisasi, dedup, sentiment & impact scoring, disimpan ke database, dan ditampilkan di dashboard.

## 1. Database (migration)

Tiga tabel baru di Supabase:

- **news_articles** — `id, source, source_id, title, summary, url, canonical_url, image_url, published_at, fetched_at, category, tickers text[], sectors text[], keywords text[], sentiment, sentiment_score, confidence, impact_level, impact_score, related_symbols text[], is_duplicate bool, duplicate_of uuid, duplicate_sources text[], raw_payload jsonb`. Indexes: `(published_at desc)`, GIN on `tickers`, unique on `(source, source_id)`.
- **news_sources** — `id, name, type, url, fallback_url, priority, category, enabled, last_success_at, last_failed_at, last_error, status, fail_count`.
- **ticker_sentiment_summary** — `symbol pk, positive_count, neutral_count, negative_count, average_sentiment_score, high_impact_news_count, latest_news_at, summary, updated_at`.

RLS: read public untuk authenticated; write hanya via service role (cron/server). Seed `news_sources` dengan 5 sumber sesuai brief.

## 2. Server (TanStack server functions + routes)

**File baru** di `src/lib/`:

- `news-sources.ts` — definisi `NEWS_SOURCES` (Kontan, CNBC market+fallback, ANTARA, Investor.id w/ feed probing, Google News). Konstanta keywords saham, ticker IDX, sektor mapping.
- `news-rss.server.ts` — RSS/Atom parser ringan pakai `fast-xml-parser` (sudah lightweight, Worker-safe). Fetch dengan timeout 10s, retry 2x, AbortController.
- `news-pipeline.server.ts` — normalize → filter keyword → extract ticker (regex BBCA|BBRI|… + `.JK`) → sentiment rule-based (lexicon ID positif/negatif) + optional Lovable AI untuk batch ringkas → impact scoring → dedup by normalized title similarity (Jaro-Winkler ringan) + canonical URL.
- `news.functions.ts` — server fns: `listNews(filter)`, `getNewsForTicker(symbol)`, `getTickerSentiment(symbol)`, `getMarketSentiment()`, `getSourcesStatus()`.

**Cron route** `src/routes/api/public/cron/news.ts` — POST: jalankan pipeline untuk semua source enabled, tulis ke DB pakai `supabaseAdmin`, update `news_sources` status, refresh `ticker_sentiment_summary`. Dijadwalkan pg_cron tiap 10 menit.

**Public API** (opsional, tipis): `src/routes/api/public/news.ts` GET dengan query params untuk eksternal. App sendiri pakai server fns.

Hapus dependensi frontend dari RSS langsung — semua via DB.

## 3. Integrasi dengan halaman yang sudah ada

- `src/lib/news-impact.functions.ts` — extend `newsImpact` agar membaca dari `news_articles` (filter by ticker) sebagai sumber utama, fallback ke Yahoo/Marketaux yang sudah ada.
- `src/routes/_authenticated/news.tsx` — tetap pakai `newsImpact`, otomatis dapat data baru.
- Chart page (`chart.$symbol.tsx`) — panel berita per-ticker tetap, sumber jadi DB.

## 4. UI baru — News Dashboard

Halaman baru `src/routes/_authenticated/news-hub.tsx` (link di sidebar):
- **Market Sentiment Overview** — gauge bullish/bearish, count positive/neutral/negative, top bullish & bearish tickers, high-impact today.
- **AI Market Summary card** — panggil Lovable AI Gateway (`google/gemini-2.5-flash`) untuk ringkas 20 berita teratas → `{summary, marketBias, mainCatalysts}`. Cache 15 menit di DB.
- **Market News Feed** — list dengan source badge, sentiment badge, impact badge, ticker chips, waktu, link.
- **Source Health Monitor** — status tiap source dari `news_sources`.
- **Filter bar** — source, ticker, sentiment, impact, date range, search.

Dark fintech style mengikuti `src/styles.css` tokens yang sudah ada.

## 5. Catatan teknis

- RSS fetch khusus server (Worker runtime). Untuk Investor.id, coba 3 kandidat feed berurutan; jika semua 404, lewati (tanpa scraping HTML agresif).
- Sentiment: rule-based dulu (lexicon ID di file `news-pipeline.server.ts`); jika `LOVABLE_API_KEY` ada dan berita high-impact tanpa skor jelas, panggil AI untuk klasifikasi (batch 10 judul / call).
- Dedup: simpan `normalized_title_hash` (lowercase + strip punctuation + drop stopwords); cek similarity dengan kandidat 24 jam terakhir.
- Cache & rate limit: cron 10 menit jadi single source of truth. Tidak ada fetch RSS dari client.
- Tidak ambil full article, hanya title/summary/link/thumbnail/published.

## 6. Urutan eksekusi

1. Migration (3 tabel + RLS + seed news_sources).
2. Install `fast-xml-parser`.
3. Tulis `news-sources.ts`, `news-rss.server.ts`, `news-pipeline.server.ts`, `news.functions.ts`.
4. Tulis cron route + jadwalkan pg_cron.
5. Update `news-impact.functions.ts` untuk pakai DB.
6. Bangun `news-hub.tsx` + tambah link sidebar.
7. Smoke test: panggil cron manual, cek DB terisi, buka halaman.

Setelah plan disetujui saya jalankan migration dulu, lalu tulis kode.
