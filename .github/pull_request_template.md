# Ringkasan / Summary

<!-- Apa yang berubah dan mengapa? / What changed and why? -->

Task id (dari `TASKS.md`):

## Cara menguji / How to test

<!-- Langkah manual untuk memverifikasi perubahan ini. -->

1.
2.

## Tangkapan layar / Screenshots

<!-- Wajib untuk perubahan UI. / Required for UI changes. -->

## Checklist

- [ ] `pnpm lint` lolos
- [ ] `pnpm typecheck` lolos
- [ ] `pnpm test` lolos
- [ ] `pnpm build` lolos (static export)
- [ ] `TASKS.md` diperbarui (status + progress log)
- [ ] Copy antarmuka baru ditambahkan ke `lib/i18n.ts` untuk **id dan en**
- [ ] Tidak ada kunci API di repo/bundle/CI
- [ ] Teks dokumen tetap dipagari lewat `fenceDocument()` bila dipakai di prompt
- [ ] Tidak ada API route / server action / middleware baru
