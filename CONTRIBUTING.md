# Contributing to Substansi LPDP

Terima kasih sudah mau berkontribusi! Thanks for wanting to help out.

Bahasa: silakan buka isu atau PR dalam Bahasa Indonesia **atau** Inggris.

## Sebelum mulai / Before you start

1. Baca [`PLAN.md`](./PLAN.md) — sumber kebenaran untuk produk & arsitektur.
2. Baca [`TASKS.md`](./TASKS.md) — backlog dan status pekerjaan.
3. Baca [`AGENTS.md`](./AGENTS.md) — protokol kerja (berlaku untuk manusia juga).

Untuk perubahan besar, buka isu diskusi lebih dulu agar tidak ada pekerjaan
yang terbuang.

## Setup

```bash
pnpm install
pnpm dev
```

Node 20+ dan pnpm 9+ direkomendasikan.

## Definition of Done

Setiap PR harus memenuhi ini sebelum ditandai siap direview:

```bash
pnpm lint         # tanpa error/warning
pnpm typecheck    # tsc --noEmit bersih
pnpm test         # semua unit test lulus
pnpm build        # static export berhasil
```

Selain itu:

- Perilaku baru **terjangkau dari UI** (tidak ada kode mati).
- `TASKS.md` diperbarui (status + satu baris di progress log).
- Tidak ada pelanggaran batasan keras di bawah.

## Batasan keras / Hard constraints

Ini tidak bisa dinegosiasikan — PR yang melanggarnya akan ditolak.

1. **Aplikasi sepenuhnya statis.** Next.js App Router dengan `output: 'export'`.
   Tanpa API route, server action, atau middleware. Semuanya harus berjalan dari
   GitHub Pages.
2. **BYOK saja.** Tidak boleh ada kunci API di repo, bundle, file env, atau CI.
   Kunci hanya hidup di `localStorage` pengguna dan hanya dikirim ke base URL
   yang pengguna konfigurasi sendiri.
3. **Privasi.** Dokumen, transkrip, dan kunci tidak boleh keluar dari browser
   kecuali ke endpoint LLM pilihan pengguna. Tidak ada analitik/telemetri yang
   menangkap isi permintaan.
4. **Parsing di sisi klien.** PDF (`pdfjs-dist`), DOCX (`mammoth`), TXT diparsing
   di browser; hanya teks hasil ekstraksi yang masuk ke prompt.
5. **Pengerasan prompt-injection.** Teks dokumen adalah *data*, bukan instruksi.
   Selalu lewat `fenceDocument()` di `lib/documents.ts`, dan system prompt harus
   menyatakannya.
6. **Disclaimer.** Keterangan "tidak resmi, tidak berafiliasi dengan
   LPDP/Kemenkeu" harus tetap terlihat di landing dan halaman laporan.

## Konvensi kode

- **TypeScript `strict: true`.** Hindari `any`; gunakan tipe di `lib/types.ts`.
- **Semua copy antarmuka lewat `lib/i18n.ts`** — tidak ada string UI keras di
  komponen, dan setiap kunci harus ada di `id` **dan** `en`.
- **Semua panggilan LLM lewat `lib/llm.ts`** — jangan pernah `fetch` ke endpoint
  LLM langsung dari komponen.
- **Isi wawancara** (persona, tahap, bobot rubrik) harus sama dengan PLAN.md §1,
  §3, §5. Tabel-tabel itu adalah spesifikasi.
- Styling dengan Tailwind + primitif shadcn/ui di `components/ui/`. Utamakan
  komposisi daripada menambah dependensi baru.
- Komentar menjelaskan **mengapa**, bukan mengulang kode.

## Testing

- Logika murni **wajib** diuji: state machine tahap, pemilihan moderator,
  matematika rubrik, chunking, truncation, deteksi bahasa.
- Perilaku yang bergantung LLM: uji **penyusunan prompt** (snapshot pesan yang
  dirakit), bukan keluaran model.
- **Jangan** membuat CI bergantung pada kunci API yang hidup.

```bash
pnpm test           # sekali jalan
pnpm test:watch     # mode watch
```

## Commit & PR

Gunakan Conventional Commits dan sebutkan id task bila ada:

```
feat(interview): tambahkan segmen bahasa Inggris untuk pelamar LN (M3-5)
fix(llm): jangan lampirkan kunci pada redirect lintas origin
docs(readme): tambahkan tabel preset penyedia
chore(ci): jalankan unit test pada PR
```

Buat commit kecil dan fokus pada satu task. Dalam deskripsi PR, sebutkan:

- apa yang berubah dan mengapa,
- task id dari `TASKS.md` (jika ada),
- cara mengujinya secara manual,
- tangkapan layar untuk perubahan UI.

## Melaporkan bug

Sertakan: langkah reproduksi, perilaku yang diharapkan vs yang terjadi, browser,
dan penyedia/model LLM yang dipakai.

**Jangan pernah menempelkan kunci API Anda** di isu, log, atau tangkapan layar.

## Kode etik

Bersikap sopan dan konstruktif. Proyek ini dipakai orang yang sedang berjuang
mendapatkan beasiswa — kritik yang membantu jauh lebih berguna daripada sarkasme.
