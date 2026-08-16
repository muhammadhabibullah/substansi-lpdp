# Substansi LPDP

**Simulasi wawancara Seleksi Substansi LPDP dengan panel AI tiga pewawancara.**
Aplikasi web statis, open source, dan berjalan sepenuhnya di browser Anda.

> ⚠️ **Alat latihan tidak resmi.** Tidak berafiliasi, tidak disponsori, dan tidak
> diakui oleh LPDP maupun Kementerian Keuangan. Pertanyaan dan skor dihasilkan
> oleh model bahasa (AI) dan **tidak memprediksi hasil seleksi yang sebenarnya**.

[English version below ↓](#english)

---

## Apa ini?

Latihan menghadapi **Seleksi Substansi (wawancara) LPDP** bersama tiga
pewawancara AI, dalam Bahasa Indonesia, hingga 60 menit — lalu dapatkan laporan
penilaian berbasis rubrik dengan kutipan bukti dari jawaban Anda sendiri.

| Pewawancara | Persona | Fokus |
|---|---|---|
| **Akademisi** | Profesor di bidang Anda (diturunkan dari dokumen) | Kedalaman rencana studi, kelayakan riset, kesesuaian prodi, kesiapan akademik, pendalaman bahasa Inggris |
| **Psikolog** | Psikolog profesional | Autentisitas motivasi, resiliensi, kesadaran diri, kesiapan personal, konsistensi jawaban vs dokumen |
| **Tim LPDP** | Perwakilan LPDP/Kemenkeu | Nasionalisme, komitmen kembali ke Indonesia, rencana kontribusi konkret & terukur, akuntabilitas dana |

### Alur

1. **Persiapan** — isi profil program dan sertakan CV, rencana studi (Magister)
   atau proposal penelitian (Doktor), serta esai kontribusi. Semua diproses di
   browser.
2. **Wawancara** — 6 tahap dengan jatah waktu 5/10/15/10/15/5 menit dan timer
   60 menit yang terlihat. Setiap pewawancara memimpin blok bertanya 15–20
   menit dan boleh menyela dengan pertanyaan lanjutan singkat di luar
   bloknya. Panel menggali inkonsistensi dengan dokumen Anda dan beralih ke
   bahasa Inggris jika tujuan Anda luar negeri.
3. **Laporan** — skor 8 dimensi rubrik (total 100) + band rekomendasi, kutipan
   bukti, catatan tiap pewawancara, checklist indikator kuat/lemah, dan langkah
   perbaikan. Bisa diunduh sebagai Markdown atau dicetak ke PDF.

### Rubrik penilaian

| Dimensi | Bobot | Penilai |
|---|---:|---|
| Rencana studi / riset & kesiapan akademik | 20 | Akademisi |
| Penguasaan bidang & kesesuaian prodi-karier | 10 | Akademisi |
| Kemampuan bahasa Inggris (jika LN) / komunikasi | 10 | Akademisi |
| Motivasi & autentisitas | 10 | Psikolog |
| Kepribadian, resiliensi & kesiapan psikologis | 10 | Psikolog |
| Konsistensi jawaban vs dokumen | 10 | Psikolog |
| Nasionalisme & komitmen kembali ke Indonesia | 15 | Tim LPDP |
| Rencana kontribusi: konkret & terukur | 15 | Tim LPDP |

Skor 1–4 per dimensi, dibobot ke total 100, lalu dipetakan ke band: Sangat
Direkomendasikan (≥85) · Direkomendasikan (≥70) · Dipertimbangkan (≥55) · Belum
Direkomendasikan.

Kriteria diturunkan dari [panduan publik LPDP tentang persiapan Seleksi
Substansi](https://lpdp.kemenkeu.go.id/beasiswa/serba-serbi/ini-yang-perlu-disiapkan-untuk-hadapi-seleksi-substansi-lpdp).

## Bawa kunci API Anda sendiri (BYOK)

Aplikasi ini **tidak punya server** dan **tidak menyertakan kunci API apa pun**.
Anda memakai kunci sendiri dari penyedia **OpenAI-compatible** mana pun:

| Penyedia | Base URL | Catatan |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Disarankan `gpt-5-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | Banyak pilihan model |
| Groq | `https://api.groq.com/openai/v1` | Cepat, ada kuota gratis |
| Ollama | `http://localhost:11434/v1` | Lokal; jalankan dengan `OLLAMA_ORIGINS="*"` |
| LM Studio | `http://localhost:1234/v1` | Lokal |

Buka **Pengaturan**, isi base URL + kunci + model, lalu klik **Uji koneksi**.

> Saran keamanan: pakai kunci proyek terpisah dengan batas pengeluaran (spend
> limit), lalu cabut setelah selesai berlatih.

### Privasi

- Aplikasi ini sepenuhnya statis — tidak ada backend, tidak ada basis data.
- PDF diparsing dengan `pdfjs-dist` dan DOCX dengan `mammoth`, keduanya **di
  browser**. Berkas asli tidak pernah diunggah ke mana pun.
- Kunci API disimpan hanya di `localStorage` dan **hanya dilampirkan** ke
  permintaan menuju base URL yang Anda konfigurasi sendiri.
- Tidak ada analitik atau telemetri yang merekam isi dokumen/jawaban.
- Prompt dan jawaban Anda dikirim ke endpoint LLM pilihan Anda dan tunduk pada
  kebijakan privasi penyedia tersebut. Ingin sepenuhnya offline? Pakai Ollama.

## Menjalankan sendiri

```bash
git clone https://github.com/muhammadhabibullah/substansi-lpdp.git
cd substansi-lpdp
pnpm install
pnpm dev          # http://localhost:3000
```

Build statis (hasilnya identik dengan yang di-deploy):

```bash
pnpm build        # keluaran ke out/
npx serve out     # pratinjau hasil build
```

### Perintah

```bash
pnpm dev          # server pengembangan
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # unit test (vitest)
pnpm build        # next build → static export ke out/
```

### Deploy ke GitHub Pages

Sudah otomatis: workflow `.github/workflows/deploy.yml` berjalan pada setiap
push ke `main`. Aktifkan **Settings → Pages → Source: GitHub Actions**.
`basePath` diatur otomatis, jadi project Pages (`/substansi-lpdp`) maupun user
Pages (root) sama-sama berfungsi.

## Contoh dokumen

Belum siap memakai dokumen asli? Ada contoh dummy di
[`examples/`](./examples) — CV, rencana studi, dan esai kontribusi fiktif yang
bisa langsung ditempel ke halaman Persiapan.

## Arsitektur singkat

```
app/          # halaman: /, /setup, /interview, /report, /settings, /privacy
lib/
  llm.ts      # satu-satunya gerbang ke LLM (Vercel AI SDK, OpenAI-compatible)
  documents.ts# parsing PDF/DOCX/TXT + chunking + pemagaran anti prompt-injection
  rubric.ts   # 8 dimensi, bobot, band
  report.ts   # penilaian + narasi + checklist indikator
  i18n.ts     # seluruh copy antarmuka (id/en)
  panel/
    phases.ts    # state machine 6 tahap
    personas.ts  # system prompt tiap pewawancara
    moderator.ts # pemilih pembicara berikutnya
    notetaker.ts # anotasi jawaban untuk bukti laporan
    engine.ts    # helper murni: sesi, jam, konteks
```

Detail lengkap ada di [`PLAN.md`](./PLAN.md); backlog di [`TASKS.md`](./TASKS.md);
panduan kontributor di [`CONTRIBUTING.md`](./CONTRIBUTING.md) dan
[`AGENTS.md`](./AGENTS.md).

## Kontribusi

Kontribusi sangat diterima — lihat [`CONTRIBUTING.md`](./CONTRIBUTING.md).
Berlisensi [MIT](./LICENSE).

---

<a name="english"></a>

# English

**Substansi LPDP** is an open-source, fully static web app that simulates
Indonesia's **LPDP scholarship Seleksi Substansi (interview)** with a
three-panelist AI board, conducted primarily in Bahasa Indonesia, and ends with a
rubric-scored report.

> ⚠️ **Unofficial practice tool.** Not affiliated with, sponsored by, or endorsed
> by LPDP or the Indonesian Ministry of Finance. Questions and scores are
> AI-generated and **do not predict real selection outcomes**.

## How it works

1. **Setup** — fill in your programme profile and add your CV, study plan
   (master's) or research proposal (doctorate), and contribution essay. Parsed
   in-browser.
2. **Interview** — six phases on a visible 60-minute clock (5/10/15/10/15/5 min).
   Each panelist leads a 15–20 minute block of questioning and may interject a
   short follow-up outside their block. The panel probes inconsistencies
   against your documents and switches to English mid-session if your
   destination is overseas.
3. **Report** — eight weighted rubric dimensions scored out of 100, a
   recommendation band, evidence quotes, per-panelist narratives, a strong/weak
   signal checklist, and concrete next steps. Export as Markdown or print to PDF.

## The panel

| Panelist | Persona | Focus |
|---|---|---|
| **Academic** | A professor in your own field, derived from your documents | Study-plan depth, research feasibility, programme fit, academic readiness, English follow-ups |
| **Psychologist** | Professional psychologist | Motivation authenticity, resilience, self-awareness, personal readiness, consistency vs documents |
| **LPDP Team** | LPDP/Ministry of Finance official | Nationalism, commitment to return to Indonesia, concrete and measurable contribution plans, funding accountability |

## Bring your own key

There is no server and no bundled API key. Configure any OpenAI-compatible
endpoint (OpenAI, OpenRouter, Groq, Ollama, LM Studio) in **Settings**. Your key
lives only in `localStorage` and is attached only to requests going to the base
URL you configured yourself.

## Privacy

Fully static: no backend, no database, no content-capturing analytics. Documents
are parsed in your browser (`pdfjs-dist`, `mammoth`) and only extracted text
excerpts reach the LLM endpoint you choose. Want to stay fully offline? Use a
local model via Ollama or LM Studio.

## Run it yourself

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # static export → out/
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Licensed under [MIT](./LICENSE).
