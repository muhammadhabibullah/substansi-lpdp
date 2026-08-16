/**
 * lib/i18n.ts — all user-facing UI copy (Bahasa Indonesia + English).
 *
 * AGENTS.md convention: no hardcoded user-facing copy in components. Components
 * read strings through `useI18n()` (client) or `getCopy(locale)` (pure).
 *
 * `id` is the default and the canonical source; `en` is a full parallel variant.
 * The copy tree is typed off the `id` tree, so a missing English key is a
 * compile error.
 */

export type Locale = 'id' | 'en';

export const LOCALES: readonly Locale[] = ['id', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'id';
export const LOCALE_STORAGE_KEY = 'substansi-lpdp:locale';

export const LOCALE_LABELS: Record<Locale, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
};

/*
 * The `id` tree is the canonical shape. It is deliberately NOT `as const`:
 * widening to `string` is what lets `Copy` describe "a copy tree" rather than
 * "these exact Indonesian sentences", so the `en` tree can satisfy it.
 */
const id = {
  meta: {
    appName: 'Substansi LPDP',
    tagline: 'Simulasi wawancara Seleksi Substansi LPDP dengan panel AI',
    description:
      'Latihan wawancara Seleksi Substansi LPDP bersama tiga pewawancara AI (Akademisi, Psikolog, Tim LPDP), lengkap dengan laporan penilaian berbasis rubrik. Gratis, open source, dan berjalan sepenuhnya di browser Anda.',
  },

  nav: {
    home: 'Beranda',
    setup: 'Persiapan',
    interview: 'Wawancara',
    report: 'Laporan',
    settings: 'Pengaturan',
    privacy: 'Privasi',
    languageLabel: 'Bahasa antarmuka',
    skipToContent: 'Lewati ke konten utama',
    openMenu: 'Buka menu',
    closeMenu: 'Tutup menu',
  },

  disclaimer: {
    short:
      'Alat latihan tidak resmi — tidak berafiliasi dengan LPDP/Kemenkeu. Skor di sini tidak memprediksi hasil seleksi asli.',
    title: 'Bukan alat resmi LPDP',
    body: 'Aplikasi ini adalah alat latihan mandiri yang dibuat komunitas. Tidak berafiliasi, tidak disponsori, dan tidak diakui oleh LPDP maupun Kementerian Keuangan. Pertanyaan, penilaian, dan skor dihasilkan oleh model bahasa (AI) dan tidak memprediksi hasil seleksi yang sebenarnya.',
  },

  common: {
    start: 'Mulai',
    next: 'Lanjut',
    back: 'Kembali',
    cancel: 'Batal',
    save: 'Simpan',
    saved: 'Tersimpan',
    saving: 'Menyimpan…',
    close: 'Tutup',
    clear: 'Hapus',
    remove: 'Hapus',
    edit: 'Ubah',
    retry: 'Coba lagi',
    copy: 'Salin',
    copied: 'Tersalin',
    download: 'Unduh',
    print: 'Cetak / PDF',
    loading: 'Memuat…',
    optional: 'opsional',
    required: 'wajib',
    yes: 'Ya',
    no: 'Tidak',
    or: 'atau',
    minutes: 'menit',
    characters: 'karakter',
    words: 'kata',
    show: 'Tampilkan',
    hide: 'Sembunyikan',
    continue: 'Lanjutkan',
    reset: 'Atur ulang',
    example: 'Contoh',
    unknownError: 'Terjadi kesalahan yang tidak diketahui.',
  },

  landing: {
    heroBadge: 'Open source · Gratis · Berjalan di browser Anda',
    heroTitle: 'Latih wawancara Seleksi Substansi LPDP Anda',
    heroSubtitle:
      'Hadapi panel tiga pewawancara AI — Akademisi, Psikolog, dan Tim LPDP — hingga 60 menit dalam Bahasa Indonesia, lalu dapatkan laporan penilaian dengan kutipan bukti dari jawaban Anda sendiri.',
    ctaPrimary: 'Mulai persiapan',
    ctaSecondary: 'Atur kunci API',
    ctaResume: 'Lanjutkan wawancara',
    ctaReport: 'Lihat laporan terakhir',
    howTitle: 'Cara kerjanya',
    howSteps: [
      {
        title: '1. Siapkan dokumen',
        body: 'Unggah atau tempel CV, rencana studi atau proposal penelitian, dan esai kontribusi Anda — dokumen yang sama seperti yang Anda kirim ke LPDP. Semua diproses di browser.',
      },
      {
        title: '2. Jalani wawancara',
        body: 'Panel bertanya bergantian, menggali inkonsistensi dengan dokumen Anda, dan beralih ke bahasa Inggris jika tujuan Anda luar negeri. Timer 60 menit terlihat sepanjang sesi.',
      },
      {
        title: '3. Terima laporan',
        body: 'Skor 8 dimensi rubrik dengan bobot resmi-ala LPDP, kutipan bukti, catatan tiap pewawancara, dan langkah perbaikan yang konkret. Bisa diunduh sebagai Markdown atau PDF.',
      },
    ],
    panelTitle: 'Tiga pewawancara, tiga sudut pandang',
    rubricTitle: 'Dinilai dengan rubrik yang transparan',
    rubricBody:
      'Delapan dimensi penilaian dengan bobot total 100, diturunkan dari panduan resmi LPDP tentang persiapan Seleksi Substansi. Setiap skor disertai kutipan jawaban Anda sebagai bukti.',
    privacyTitle: 'Dokumen Anda tidak ke mana-mana',
    privacyBody:
      'Aplikasi ini sepenuhnya statis: tidak ada server milik kami, tidak ada basis data, tidak ada analitik yang merekam isi jawaban. Dokumen, transkrip, dan kunci API hanya ada di browser Anda, dan permintaan dikirim langsung ke endpoint LLM pilihan Anda.',
    byokTitle: 'Bawa kunci API Anda sendiri (BYOK)',
    byokBody:
      'Anda memakai kunci API sendiri dari penyedia OpenAI-compatible mana pun — OpenAI, OpenRouter, Groq, atau model lokal via Ollama/LM Studio. Kunci disimpan hanya di localStorage browser Anda.',
    byokCta: 'Buka pengaturan BYOK',
    needSettingsWarning:
      'Anda belum mengatur endpoint LLM. Atur dulu di halaman Pengaturan sebelum memulai wawancara.',
    openSourceTitle: 'Open source',
    openSourceBody:
      'Berlisensi MIT. Baca kodenya, laporkan isu, atau jalankan salinan Anda sendiri — hasil build-nya identik.',
    viewSource: 'Lihat kode sumber',
  },

  panelists: {
    akademisi: {
      name: 'Akademisi',
      role: 'Profesor di bidang Anda',
      focus:
        'Kedalaman rencana studi, kelayakan riset, kesesuaian universitas & prodi, kesiapan akademik, serta pendalaman berbahasa Inggris untuk tujuan luar negeri.',
      initial: 'A',
    },
    psikolog: {
      name: 'Psikolog',
      role: 'Psikolog profesional',
      focus:
        'Autentisitas motivasi, resiliensi, kesadaran diri, kesiapan personal dan keluarga, serta konsistensi jawaban dengan dokumen.',
      initial: 'P',
    },
    lpdp: {
      name: 'Tim LPDP',
      role: 'Perwakilan LPDP/Kemenkeu',
      focus:
        'Nasionalisme dan komitmen kembali ke Indonesia, rencana kontribusi yang konkret dan terukur, keselarasan dengan prioritas nasional, serta akuntabilitas dana.',
      initial: 'L',
    },
    moderator: {
      name: 'Moderator',
      role: 'Pemandu sesi',
      focus: 'Mengatur alur, urutan bicara, dan waktu wawancara.',
      initial: 'M',
    },
    you: {
      name: 'Anda',
      role: 'Kandidat',
      focus: '',
      initial: 'K',
    },
  },

  setup: {
    title: 'Persiapan wawancara',
    subtitle:
      'Isi profil program dan sertakan dokumen Anda. Semakin lengkap, semakin tajam pertanyaan panel.',
    stepProfile: 'Profil',
    stepDocuments: 'Dokumen',
    stepReview: 'Tinjau & mulai',

    profileTitle: 'Profil pendaftar',
    profileSubtitle:
      'Data ini membentuk persona pewawancara dan arah pertanyaan. Disimpan hanya di browser Anda.',
    fieldName: 'Nama lengkap',
    fieldNamePlaceholder: 'Nama yang ingin dipanggil panel',
    fieldJenjang: 'Jenjang',
    fieldJenjangMagister: 'Magister (S2)',
    fieldJenjangDoktor: 'Doktor (S3)',
    fieldTujuan: 'Tujuan studi',
    fieldTujuanDN: 'Dalam negeri',
    fieldTujuanLN: 'Luar negeri',
    fieldUniversitas: 'Universitas tujuan',
    fieldUniversitasPlaceholder: 'Contoh: University of Melbourne',
    fieldProdi: 'Program studi tujuan',
    fieldProdiPlaceholder: 'Contoh: Master of Public Health',
    fieldLoa: 'Status LoA',
    loaUnconditional: 'LoA Unconditional',
    loaConditional: 'LoA Conditional',
    loaNone: 'Belum punya LoA',
    fieldSkema: 'Skema beasiswa',
    skemaReguler: 'Reguler',
    skemaPtud: 'PTUD (Perguruan Tinggi Utama Dunia)',
    skemaAfirmasi: 'Afirmasi',
    skemaTargeted: 'Targeted',
    fieldBidang: 'Bidang keilmuan',
    fieldBidangPlaceholder: 'Contoh: Kesehatan masyarakat / epidemiologi',
    fieldBidangHelp:
      'Menentukan spesialisasi pewawancara Akademisi. Tulis sespesifik mungkin.',
    fieldPekerjaan: 'Pekerjaan saat ini',
    fieldPekerjaanPlaceholder: 'Contoh: Analis kebijakan di Dinas Kesehatan',
    fieldPekerjaanHelp: 'Termasuk status fresh graduate atau sedang tidak bekerja.',
    fieldTargetLanguage: 'Bahasa wawancara',
    langId: 'Bahasa Indonesia',
    langMixed: 'Bahasa Indonesia + segmen bahasa Inggris',
    fieldTargetLanguageHelpLN:
      'Untuk tujuan luar negeri, panel Akademisi akan beralih ke bahasa Inggris di tengah sesi — sama seperti wawancara aslinya.',

    documentsTitle: 'Dokumen pendukung',
    documentsSubtitle:
      'Unggah PDF/DOCX/TXT atau tempel teksnya langsung. File tidak diunggah ke server mana pun — hanya teksnya yang diekstrak di browser dan dikirim bersama prompt.',
    docCv: 'CV / riwayat hidup',
    docCvHelp: 'Dipakai oleh ketiga pewawancara untuk menggali pengalaman dan konsistensi.',
    docStudyPlan: 'Rencana studi',
    docStudyPlanHelp: 'Fokus utama pendalaman oleh Akademisi.',
    docProposal: 'Proposal penelitian',
    docProposalHelp: 'Fokus utama pendalaman oleh Akademisi untuk pelamar Doktor.',
    docEssay: 'Esai kontribusi',
    docEssayHelp:
      'Komitmen kembali ke Indonesia dan rencana kontribusi pascastudi — fokus utama Tim LPDP.',
    dropzoneLabel: 'Jatuhkan berkas di sini atau klik untuk memilih',
    dropzoneHint: 'PDF, DOCX, atau TXT · maksimal {size}',
    pasteTab: 'Tempel teks',
    uploadTab: 'Unggah berkas',
    pastePlaceholder: 'Tempel isi dokumen Anda di sini…',
    parsing: 'Mengekstrak teks…',
    parsedOk: '{words} kata diekstrak dari {pages} halaman',
    parsedOkNoPages: '{words} kata diekstrak',
    parseFailed: 'Gagal membaca berkas',
    previewTitle: 'Pratinjau teks',
    previewToggleShow: 'Tampilkan pratinjau',
    previewToggleHide: 'Sembunyikan pratinjau',
    truncatedNotice:
      'Dokumen ini lebih panjang dari batas {limit} karakter. Bagian tengah akan diringkas otomatis sebelum dikirim ke panel.',
    emptyTextWarning:
      'Tidak ada teks yang bisa diekstrak. Jika ini PDF hasil pindai (gambar), salin teksnya secara manual ke tab "Tempel teks".',
    scannedPdfHint:
      'PDF ini sepertinya hasil pindai tanpa lapisan teks. Gunakan tab "Tempel teks".',

    reviewTitle: 'Tinjau sebelum mulai',
    reviewSubtitle: 'Pastikan semuanya siap. Anda bisa kembali dan mengubah kapan pun.',
    reviewProfile: 'Profil',
    reviewDocuments: 'Dokumen',
    reviewLlm: 'Pengaturan LLM',
    reviewLlmReady: 'Endpoint dan model sudah diatur',
    reviewLlmMissing: 'Belum diatur — wawancara tidak bisa dimulai',
    reviewBudget: 'Perkiraan konteks',
    reviewBudgetValue: '{chars} karakter dokumen akan dipakai panel',
    startInterview: 'Mulai wawancara 60 menit',
    startInterviewShort: 'Mulai wawancara',
    blockedTitle: 'Belum bisa memulai',
    missingProfileFields: 'Lengkapi dulu: {fields}',
    missingDocs: 'Sertakan dokumen: {docs}',
    missingLlm: 'Atur endpoint LLM di halaman Pengaturan',
    existingSessionWarning:
      'Ada wawancara yang belum selesai. Memulai yang baru akan menghapus transkrip lama.',
    existingSessionResume: 'Lanjutkan yang lama',
    existingSessionDiscard: 'Mulai baru',
    autoSavedNote: 'Perubahan tersimpan otomatis di browser ini.',
  },

  interview: {
    title: 'Sesi wawancara',
    connecting: 'Menghubungkan ke panel…',
    panelPreparing: 'Panel sedang membaca dokumen Anda…',
    phaseLabel: 'Tahap',
    phaseProgress: 'Tahap {current} dari {total}',
    timeRemaining: 'Waktu tersisa',
    timeElapsed: 'Waktu berjalan',
    overtime: 'Melewati waktu',
    inputPlaceholder: 'Tulis jawaban Anda…',
    inputPlaceholderWaiting: 'Tunggu panel selesai berbicara…',
    send: 'Kirim',
    sendHint: 'Enter untuk kirim · Shift+Enter untuk baris baru',
    inputModeText: 'Ketik',
    inputModeVoice: 'Suara',
    voiceStart: 'Mulai berbicara',
    voiceStop: 'Berhenti mendengarkan',
    voiceListening: 'Mendengarkan… silakan bicara.',
    voiceIdleHint: 'Tekan mikrofon lalu bicara. Setelah berhenti, transkrip bisa diedit sebelum dikirim.',
    voicePlaceholder: 'Jawaban lisan Anda akan muncul di sini.',
    voiceTranscriptLabel: 'Transkrip jawaban suara',
    voiceDiscard: 'Hapus transkrip',
    voiceEditableNote:
      'Jawaban suara ditranskripsikan otomatis. Setelah selesai bicara, periksa dan edit bila perlu sebelum dikirim.',
    voicePrivacyNote:
      'Transkripsi diproses oleh layanan bawaan browser Anda; hanya teks hasilnya yang dipakai aplikasi ini.',
    voiceDenied:
      'Akses mikrofon ditolak. Izinkan mikrofon untuk situs ini di browser, atau gunakan mode ketik.',
    voiceNetwork:
      'Layanan transkripsi browser gagal karena masalah jaringan. Coba lagi atau gunakan mode ketik.',
    voiceOtherError: 'Input suara terhenti. Coba lagi atau gunakan mode ketik.',
    voiceUnsupported:
      'Browser ini tidak mendukung input suara. Gunakan mode ketik.',
    thinking: 'sedang menyusun pertanyaan…',
    typing: 'sedang berbicara…',
    endEarly: 'Akhiri lebih awal',
    endEarlyConfirmTitle: 'Akhiri wawancara sekarang?',
    endEarlyConfirmBody:
      'Panel akan langsung menutup sesi dan laporan disusun dari jawaban yang sudah ada. Tindakan ini tidak bisa dibatalkan.',
    endEarlyConfirm: 'Ya, akhiri dan nilai',
    wrappingUp: 'Panel sedang menutup sesi…',
    finishing: 'Menyusun laporan penilaian…',
    finished: 'Wawancara selesai',
    finishedSessionBody:
      'Sesi wawancara sebelumnya telah selesai. Lihat laporan penilaian Anda, atau mulai wawancara baru.',
    finishedSessionDuration: 'Durasi: {duration} · {answers}',
    startNewSession: 'Mulai wawancara baru',
    viewReport: 'Lihat laporan',
    noSessionTitle: 'Belum ada sesi wawancara',
    noSessionBody: 'Selesaikan persiapan terlebih dahulu untuk memulai wawancara.',
    noSessionCta: 'Ke halaman persiapan',
    recoveredTitle: 'Sesi dipulihkan',
    recoveredBody:
      'Wawancara Anda dilanjutkan dari titik terakhir yang tersimpan di browser ini.',
    pausedTitle: 'Sesi dijeda',
    pause: 'Jeda',
    resume: 'Lanjutkan',
    languageSwitchNotice: 'Pewawancara beralih ke bahasa Inggris.',
    languageSwitchBackNotice: 'Pewawancara kembali ke Bahasa Indonesia.',
    errorTitle: 'Gagal menghubungi model',
    errorRetry: 'Coba lagi',
    errorSkipTurn: 'Lewati giliran ini',
    errorEndSession: 'Akhiri dan nilai sekarang',
    rateLimited:
      'Endpoint membatasi laju permintaan (rate limit). Tunggu sebentar lalu coba lagi.',
    authFailed:
      'Kunci API ditolak endpoint. Periksa kunci dan base URL di halaman Pengaturan.',
    networkFailed:
      'Permintaan gagal — periksa koneksi internet dan apakah endpoint mengizinkan akses dari browser (CORS).',
    streamInterrupted: 'Aliran jawaban terputus di tengah. Anda bisa mencoba lagi.',
    noteTakerFailed:
      'Catatan penilaian untuk jawaban ini gagal dibuat. Wawancara tetap berlanjut; laporan akan sedikit kurang detail.',
    transcriptTitle: 'Transkrip',
    turnCount: '{count} percakapan',
    answersCount: '{count} jawaban Anda',
    autoSaveNote: 'Tersimpan otomatis',
    clockPausedNote: 'Timer berhenti saat tab tidak aktif tidak berlaku — waktu terus berjalan.',
    phaseNudge: 'Panel berpindah ke tahap berikutnya.',
    closingStatementPrompt:
      'Ini kesempatan terakhir Anda — sampaikan closing statement.',
  },

  phases: {
    opening: {
      name: 'Pembukaan & perkenalan diri',
      goal: 'Panel memperkenalkan diri dan meminta Anda memperkenalkan diri secara ringkas.',
    },
    motivation: {
      name: 'Latar belakang & motivasi studi',
      goal: 'Menggali alasan melanjutkan studi, pilihan bidang, dan perjalanan Anda sampai titik ini.',
    },
    studyPlan: {
      name: 'Rencana studi / proposal riset',
      goal: 'Pendalaman akademik oleh Akademisi, termasuk kelayakan riset dan kesesuaian prodi.',
    },
    personality: {
      name: 'Kepribadian, kesiapan & konsistensi',
      goal: 'Psikolog menguji resiliensi, kesiapan personal, dan konsistensi jawaban dengan dokumen.',
    },
    contribution: {
      name: 'Nasionalisme & rencana kontribusi',
      goal: 'Tim LPDP menguji komitmen kembali ke Indonesia dan rencana kontribusi yang terukur.',
    },
    closing: {
      name: 'Pertanyaan penutup & closing statement',
      goal: 'Pertanyaan terakhir dari panel dan closing statement Anda.',
    },
  },

  settings: {
    title: 'Pengaturan',
    subtitle:
      'Aplikasi ini memakai kunci API Anda sendiri (BYOK). Kunci disimpan hanya di browser ini dan dikirim hanya ke endpoint yang Anda tentukan.',
    llmSectionTitle: 'Endpoint LLM',
    presetLabel: 'Preset penyedia',
    presetCustom: 'Kustom',
    presetHelp: 'Memilih preset akan mengisi base URL dan model yang disarankan.',
    baseUrlLabel: 'Base URL',
    baseUrlHelp:
      'Harus endpoint OpenAI-compatible, biasanya berakhiran /v1. Contoh: https://api.openai.com/v1',
    apiKeyLabel: 'Kunci API',
    apiKeyHelp: 'Disimpan di localStorage browser ini saja.',
    apiKeyPlaceholder: 'sk-…',
    apiKeyStored: 'Kunci tersimpan di browser ini',
    apiKeyNotNeeded: 'Preset ini biasanya tidak memerlukan kunci.',
    modelLabel: 'Model',
    modelHelp: 'Model utama untuk pewawancara dan laporan.',
    modelSuggested: 'Disarankan: {model}',
    cheapModelLabel: 'Model ringan (moderator & catatan)',
    cheapModelHelp:
      'Dipakai untuk langkah kecil dan sering: memilih pembicara berikutnya dan mencatat penilaian. Kosongkan untuk memakai model utama.',
    temperatureLabel: 'Temperature',
    temperatureHelp: 'Semakin rendah, semakin konsisten. Disarankan 0.7 untuk wawancara.',
    testConnection: 'Uji koneksi',
    testing: 'Menguji…',
    testSuccess: 'Berhasil. Model menjawab: “{reply}”',
    testFailed: 'Gagal: {error}',
    testMissingFields: 'Isi base URL dan model terlebih dahulu.',
    clearKey: 'Hapus kunci API',
    clearAll: 'Hapus semua data aplikasi',
    clearAllConfirm:
      'Hapus kunci API, profil, dokumen, transkrip, dan laporan dari browser ini? Tindakan ini tidak bisa dibatalkan.',
    clearedAll: 'Semua data aplikasi di browser ini telah dihapus.',
    safetyTitle: 'Keamanan kunci API',
    safetyPoints: [
      'Kunci Anda disimpan di localStorage browser ini, bukan di server kami — kami tidak punya server.',
      'Kunci hanya dilampirkan ke permintaan menuju base URL yang Anda isi sendiri, tidak pernah ke pihak ketiga.',
      'Gunakan kunci proyek terpisah dengan batas pengeluaran (spend limit), lalu cabut setelah selesai.',
      'Hindari memakai perangkat publik atau bersama. Bersihkan dengan tombol "Hapus kunci API".',
      'Endpoint yang Anda pakai harus mengizinkan permintaan dari browser (CORS).',
    ],
    dataSectionTitle: 'Data di browser ini',
    dataProfile: 'Profil pendaftar',
    dataDocuments: 'Dokumen',
    dataInterview: 'Sesi wawancara',
    dataReport: 'Laporan',
    dataPresent: 'Ada',
    dataAbsent: 'Kosong',
    dataSizeNote: 'Total ±{size} terpakai di localStorage.',
    localeSectionTitle: 'Bahasa antarmuka',
    localeHelp:
      'Mengubah bahasa antarmuka. Bahasa wawancara diatur terpisah di halaman Persiapan.',
    corsNoteTitle: 'Catatan CORS',
    corsNoteBody:
      'OpenAI, OpenRouter, dan Groq mengizinkan permintaan langsung dari browser. Untuk Ollama, jalankan dengan OLLAMA_ORIGINS="*" agar browser diizinkan.',
  },

  presets: {
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    groq: 'Groq',
    ollama: 'Ollama (lokal)',
    lmstudio: 'LM Studio (lokal)',
  },

  report: {
    title: 'Laporan penilaian',
    subtitle: 'Disusun dari transkrip wawancara Anda dan rubrik penilaian 8 dimensi.',
    generating: 'Menyusun laporan…',
    generatingStep: '{step} dari {total}: {label}',
    stepScoring: 'Menilai dimensi rubrik',
    stepNarrative: 'Menulis catatan pewawancara',
    stepSignals: 'Memeriksa indikator kuat/lemah',
    stepNextSteps: 'Merumuskan langkah perbaikan',
    generateFailed: 'Gagal menyusun laporan',
    regenerate: 'Susun ulang laporan',
    regenerateUnavailable:
      'Hanya sesi wawancara terakhir yang masih tersimpan yang bisa disusun ulang.',
    historyTitle: 'Riwayat laporan',
    historySubtitle: '{count} sesi wawancara tersimpan di browser ini.',
    historyAnswers: '{count} jawaban',
    historyLatest: 'Terbaru',
    historyView: 'Lihat laporan',
    historyDelete: 'Hapus laporan',
    historyDeleteConfirm:
      'Hapus laporan ini dari riwayat? Tindakan ini tidak bisa dibatalkan.',
    noReportTitle: 'Belum ada laporan',
    noReportBody: 'Selesaikan satu sesi wawancara untuk mendapatkan laporan penilaian.',
    noReportCta: 'Mulai persiapan',
    totalScore: 'Skor total',
    ofHundred: 'dari 100',
    band: 'Rekomendasi',
    dimensionsTitle: 'Skor per dimension',
    dimensionTable: {
      dimension: 'Dimensi',
      owner: 'Penilai',
      weight: 'Bobot',
      score: 'Skor',
      weighted: 'Nilai',
    },
    evidenceTitle: 'Bukti kutipan',
    evidenceEmpty: 'Tidak ada kutipan spesifik yang tercatat untuk dimensi ini.',
    strengthsTitle: 'Kekuatan',
    weaknessesTitle: 'Yang perlu diperbaiki',
    panelNotesTitle: 'Catatan pewawancara',
    signalsTitle: 'Indikator kandidat kuat & lemah',
    signalsSubtitle:
      'Diperiksa terhadap panduan resmi LPDP tentang persiapan Seleksi Substansi.',
    signalStrong: 'Terlihat',
    signalPartial: 'Sebagian',
    signalMissing: 'Belum terlihat',
    signalStrongTitle: 'Indikator kandidat kuat',
    signalWeakTitle: 'Indikator kandidat lemah',
    signalWeakPresent: 'Terdeteksi',
    signalWeakAbsent: 'Tidak terdeteksi',
    nextStepsTitle: 'Langkah perbaikan',
    transcriptTitle: 'Transkrip lengkap',
    transcriptToggleShow: 'Tampilkan transkrip',
    transcriptToggleHide: 'Sembunyikan transkrip',
    metaTitle: 'Detail sesi',
    metaDate: 'Tanggal',
    metaDuration: 'Durasi',
    metaModel: 'Model',
    metaPhasesCovered: 'Tahap yang tercapai',
    metaAnswers: 'Jumlah jawaban',
    downloadMarkdown: 'Unduh Markdown',
    printPdf: 'Cetak / simpan PDF',
    scoreLabels: {
      1: 'Kurang',
      2: 'Cukup',
      3: 'Baik',
      4: 'Sangat baik',
    },
  },

  bands: {
    sangat: {
      label: 'Sangat Direkomendasikan',
      description:
        'Jawaban konsisten, spesifik, dan meyakinkan di hampir semua dimensi. Pertahankan dan perhalus penyampaian.',
    },
    direkomendasikan: {
      label: 'Direkomendasikan',
      description:
        'Fondasi kuat dengan beberapa celah yang masih bisa diperbaiki sebelum wawancara sesungguhnya.',
    },
    dipertimbangkan: {
      label: 'Dipertimbangkan',
      description:
        'Ada modal yang baik, tetapi beberapa dimensi penting masih normatif atau kurang bukti konkret.',
    },
    belum: {
      label: 'Belum Direkomendasikan',
      description:
        'Perlu perbaikan mendasar pada struktur jawaban, kekonkretan rencana, dan bukti pengalaman.',
    },
  },

  rubric: {
    studyPlan: {
      name: 'Rencana studi / riset & kesiapan akademik',
      description:
        'Kejelasan dan kelayakan rencana studi atau proposal riset, kesiapan metodologis, serta pemahaman atas beban studi.',
    },
    fieldMastery: {
      name: 'Penguasaan bidang & kesesuaian prodi-karier',
      description:
        'Kedalaman pemahaman bidang keilmuan dan seberapa nyambung prodi tujuan dengan jejak serta rencana karier.',
    },
    communication: {
      name: 'Kemampuan bahasa Inggris (jika LN) / komunikasi',
      description:
        'Kejelasan, struktur, dan keruntutan penyampaian; untuk tujuan luar negeri termasuk kefasihan berbahasa Inggris.',
    },
    motivation: {
      name: 'Motivasi & autentisitas',
      description:
        'Kekuatan dan keaslian alasan melanjutkan studi — spesifik dan personal, bukan normatif atau hafalan.',
    },
    resilience: {
      name: 'Kepribadian, resiliensi & kesiapan psikologis',
      description:
        'Kesadaran diri, cara menghadapi tekanan dan kegagalan, serta kesiapan personal dan keluarga untuk menjalani studi.',
    },
    consistency: {
      name: 'Konsistensi jawaban vs dokumen',
      description:
        'Kesesuaian jawaban lisan dengan CV, rencana studi, dan esai kontribusi; tidak ada klaim yang goyah saat digali.',
    },
    nationalism: {
      name: 'Nasionalisme & komitmen kembali ke Indonesia',
      description:
        'Kesungguhan komitmen pulang dan mengabdi, serta pemahaman atas konteks dan prioritas nasional.',
    },
    contribution: {
      name: 'Rencana kontribusi: konkret & terukur',
      description:
        'Rencana kontribusi pascastudi dengan sasaran, ukuran, tenggat, dan pemangku kepentingan yang jelas.',
    },
  },

  signals: {
    strong: [
      'Alur gagasan terstruktur dan saling terhubung',
      'Menunjukkan kualitas kepemimpinan',
      'Contoh konkret dan pengalaman yang kuat',
      'Sikap profesional dengan nada antusias',
      'Rencana masa depan ambisius, terukur, dan disertai caranya',
      'Jawaban autentik; pengalaman unik yang relevan dengan tujuan akademik',
      'Menonjolkan pencapaian utama dengan percaya diri',
      'Rencana kontribusi ke masyarakat yang konkret dan berdedikasi',
      'Passion yang tulus pada bidang yang dipilih',
    ],
    weak: [
      'Penyampaian tidak terstruktur dan tidak fokus',
      'Antusiasme rendah, nada ragu-ragu',
      'Terdengar membaca naskah atau hafalan, jawaban berulang',
      'Promosi diri tanpa substansi atau pencapaian',
      'Jawaban normatif dan terlalu umum',
      'Rencana kontribusi kabur atau tidak meyakinkan',
      'Rencana masa depan tanpa langkah spesifik dan terukur',
    ],
  },

  privacy: {
    title: 'Privasi & keamanan',
    subtitle: 'Apa yang terjadi pada dokumen, transkrip, dan kunci API Anda.',
    sections: [
      {
        title: 'Kami tidak menjalankan server',
        body: 'Aplikasi ini adalah kumpulan berkas statis (HTML/CSS/JS) yang dilayani oleh GitHub Pages. Tidak ada backend, tidak ada API route, dan tidak ada basis data milik proyek ini. Karena itu tidak ada tempat bagi kami untuk menyimpan data Anda.',
      },
      {
        title: 'Dokumen diproses di browser',
        body: 'PDF dibaca dengan pdfjs-dist dan DOCX dengan mammoth, keduanya berjalan di browser Anda. Berkas aslinya tidak pernah diunggah ke mana pun. Hanya potongan teks yang relevan yang disertakan dalam prompt ke endpoint LLM pilihan Anda.',
      },
      {
        title: 'Kunci API hanya di browser Anda',
        body: 'Kunci disimpan di localStorage dan dilampirkan hanya pada permintaan menuju base URL yang Anda konfigurasi sendiri. Kunci tidak pernah dikirim ke domain lain, termasuk ke pemelihara proyek ini.',
      },
      {
        title: 'Tidak ada analitik yang merekam isi',
        body: 'Tidak ada telemetri, pelacak pihak ketiga, maupun log yang menangkap isi dokumen, jawaban wawancara, atau kunci Anda.',
      },
      {
        title: 'Data pihak ketiga: penyedia LLM Anda',
        body: 'Prompt dan jawaban Anda dikirim ke endpoint LLM yang Anda pilih dan tunduk pada kebijakan privasi penyedia tersebut. Jika Anda ingin sepenuhnya offline, gunakan model lokal seperti Ollama atau LM Studio.',
      },
      {
        title: 'Mode suara memakai layanan browser',
        body: 'Jika Anda menjawab dengan mode suara, transkripsi diproses oleh layanan pengenal ucapan bawaan browser Anda (misalnya layanan Google pada Chrome). Aplikasi ini hanya menerima teks hasilnya; audio tidak pernah dikirim ke endpoint LLM maupun ke proyek ini. Jika Anda ingin sepenuhnya offline, gunakan mode ketik.',
      },
      {
        title: 'Menghapus data Anda',
        body: 'Tombol "Hapus semua data aplikasi" di halaman Pengaturan menghapus profil, dokumen, transkrip, laporan, dan kunci API dari browser ini. Membersihkan data situs di peramban juga menghapus semuanya.',
      },
    ],
  },

  footer: {
    builtWith: 'Dibangun dengan Next.js, berjalan sepenuhnya di browser Anda.',
    sourceCode: 'Kode sumber',
    license: 'Lisensi MIT',
    privacy: 'Privasi',
    lpdpSourceNote: 'Kriteria penilaian mengacu pada panduan publik LPDP.',
    lpdpSourceLink: 'Panduan Seleksi Substansi LPDP',
  },

  errors: {
    notFoundTitle: 'Halaman tidak ditemukan',
    notFoundBody: 'Tautan yang Anda buka tidak ada atau sudah berpindah.',
    notFoundCta: 'Kembali ke beranda',
    genericTitle: 'Terjadi kesalahan',
    genericBody: 'Coba muat ulang halaman. Data Anda di browser tetap aman.',
    reload: 'Muat ulang',
    missingSettingsTitle: 'Pengaturan LLM belum lengkap',
    missingSettingsBody:
      'Isi base URL, kunci API, dan model di halaman Pengaturan sebelum melanjutkan.',
    missingSettingsCta: 'Ke Pengaturan',
    storageFullTitle: 'Penyimpanan browser penuh',
    storageFullBody:
      'Transkrip tidak bisa disimpan karena localStorage penuh. Hapus data aplikasi lama atau kurangi ukuran dokumen.',
  },
};

/** The copy tree shape, derived from the canonical `id` tree. */
export type Copy = typeof id;

const en: Copy = {
  meta: {
    appName: 'Substansi LPDP',
    tagline: 'LPDP Seleksi Substansi mock interview with an AI panel',
    description:
      'Practise the LPDP Seleksi Substansi interview with three AI panelists (Academic, Psychologist, LPDP Team) and get a rubric-scored report. Free, open source, and runs entirely in your browser.',
  },

  nav: {
    home: 'Home',
    setup: 'Setup',
    interview: 'Interview',
    report: 'Report',
    settings: 'Settings',
    privacy: 'Privacy',
    languageLabel: 'Interface language',
    skipToContent: 'Skip to main content',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },

  disclaimer: {
    short:
      'Unofficial practice tool — not affiliated with LPDP/Kemenkeu. Scores here do not predict real selection outcomes.',
    title: 'Not an official LPDP tool',
    body: 'This is a community-built self-practice tool. It is not affiliated with, sponsored by, or endorsed by LPDP or the Ministry of Finance. Questions, assessments, and scores are generated by a language model (AI) and do not predict actual selection results.',
  },

  common: {
    start: 'Start',
    next: 'Next',
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save',
    saved: 'Saved',
    saving: 'Saving…',
    close: 'Close',
    clear: 'Clear',
    remove: 'Remove',
    edit: 'Edit',
    retry: 'Retry',
    copy: 'Copy',
    copied: 'Copied',
    download: 'Download',
    print: 'Print / PDF',
    loading: 'Loading…',
    optional: 'optional',
    required: 'required',
    yes: 'Yes',
    no: 'No',
    or: 'or',
    minutes: 'minutes',
    characters: 'characters',
    words: 'words',
    show: 'Show',
    hide: 'Hide',
    continue: 'Continue',
    reset: 'Reset',
    example: 'Example',
    unknownError: 'An unknown error occurred.',
  },

  landing: {
    heroBadge: 'Open source · Free · Runs in your browser',
    heroTitle: 'Practise your LPDP Seleksi Substansi interview',
    heroSubtitle:
      'Face a three-panelist AI board — Academic, Psychologist, and LPDP Team — for up to 60 minutes in Bahasa Indonesia, then get a scored report with evidence quoted from your own answers.',
    ctaPrimary: 'Start setup',
    ctaSecondary: 'Configure API key',
    ctaResume: 'Resume interview',
    ctaReport: 'View last report',
    howTitle: 'How it works',
    howSteps: [
      {
        title: '1. Prepare documents',
        body: 'Upload or paste your CV, study plan or research proposal, and contribution essay — the same materials you submitted to LPDP. Everything is processed in your browser.',
      },
      {
        title: '2. Sit the interview',
        body: 'The panel takes turns, probes inconsistencies against your documents, and switches to English if your destination is overseas. A 60-minute timer stays visible throughout.',
      },
      {
        title: '3. Get your report',
        body: 'Eight weighted rubric dimensions, evidence quotes, per-panelist notes, and concrete next steps. Download as Markdown or print to PDF.',
      },
    ],
    panelTitle: 'Three panelists, three angles',
    rubricTitle: 'Scored against a transparent rubric',
    rubricBody:
      'Eight scoring dimensions weighted to 100, derived from LPDP’s own public guidance on preparing for Seleksi Substansi. Every score comes with quotes from your answers as evidence.',
    privacyTitle: 'Your documents go nowhere',
    privacyBody:
      'This app is fully static: no server of ours, no database, no analytics that record your answers. Documents, transcripts, and API keys live only in your browser, and requests go straight to the LLM endpoint you choose.',
    byokTitle: 'Bring your own key (BYOK)',
    byokBody:
      'You use your own API key from any OpenAI-compatible provider — OpenAI, OpenRouter, Groq, or local models via Ollama/LM Studio. The key is stored only in your browser’s localStorage.',
    byokCta: 'Open BYOK settings',
    needSettingsWarning:
      'You have not configured an LLM endpoint yet. Set it up in Settings before starting an interview.',
    openSourceTitle: 'Open source',
    openSourceBody:
      'MIT licensed. Read the code, file issues, or run your own copy — the build is identical.',
    viewSource: 'View source',
  },

  panelists: {
    akademisi: {
      name: 'Academic',
      role: 'Professor in your field',
      focus:
        'Depth of the study plan, research feasibility, university and programme fit, academic readiness, and English follow-ups for overseas destinations.',
      initial: 'A',
    },
    psikolog: {
      name: 'Psychologist',
      role: 'Professional psychologist',
      focus:
        'Authenticity of motivation, resilience, self-awareness, personal and family readiness, and consistency of answers against documents.',
      initial: 'P',
    },
    lpdp: {
      name: 'LPDP Team',
      role: 'LPDP/Ministry of Finance official',
      focus:
        'Nationalism and commitment to return to Indonesia, concrete and measurable contribution plans, alignment with national priorities, and funding accountability.',
      initial: 'L',
    },
    moderator: {
      name: 'Moderator',
      role: 'Session facilitator',
      focus: 'Manages flow, speaking order, and interview timing.',
      initial: 'M',
    },
    you: {
      name: 'You',
      role: 'Candidate',
      focus: '',
      initial: 'C',
    },
  },

  setup: {
    title: 'Interview setup',
    subtitle:
      'Fill in your programme profile and add your documents. The more complete, the sharper the panel’s questions.',
    stepProfile: 'Profile',
    stepDocuments: 'Documents',
    stepReview: 'Review & start',

    profileTitle: 'Applicant profile',
    profileSubtitle:
      'This shapes the panelist personas and the direction of questions. Stored only in your browser.',
    fieldName: 'Full name',
    fieldNamePlaceholder: 'The name the panel should use',
    fieldJenjang: 'Degree level',
    fieldJenjangMagister: 'Master’s (S2)',
    fieldJenjangDoktor: 'Doctorate (S3)',
    fieldTujuan: 'Study destination',
    fieldTujuanDN: 'Domestic (Indonesia)',
    fieldTujuanLN: 'Overseas',
    fieldUniversitas: 'Target university',
    fieldUniversitasPlaceholder: 'e.g. University of Melbourne',
    fieldProdi: 'Target programme',
    fieldProdiPlaceholder: 'e.g. Master of Public Health',
    fieldLoa: 'LoA status',
    loaUnconditional: 'Unconditional LoA',
    loaConditional: 'Conditional LoA',
    loaNone: 'No LoA yet',
    fieldSkema: 'Scholarship scheme',
    skemaReguler: 'Reguler',
    skemaPtud: 'PTUD (world top universities)',
    skemaAfirmasi: 'Afirmasi',
    skemaTargeted: 'Targeted',
    fieldBidang: 'Field of study',
    fieldBidangPlaceholder: 'e.g. Public health / epidemiology',
    fieldBidangHelp:
      'Determines the Academic panelist’s specialisation. Be as specific as you can.',
    fieldPekerjaan: 'Current occupation',
    fieldPekerjaanPlaceholder: 'e.g. Policy analyst at the provincial health office',
    fieldPekerjaanHelp: 'Include fresh-graduate or currently-not-working status.',
    fieldTargetLanguage: 'Interview language',
    langId: 'Bahasa Indonesia',
    langMixed: 'Bahasa Indonesia + English segments',
    fieldTargetLanguageHelpLN:
      'For overseas destinations, the Academic panelist will switch to English mid-session — just like the real interview.',

    documentsTitle: 'Supporting documents',
    documentsSubtitle:
      'Upload PDF/DOCX/TXT or paste the text directly. Files are never uploaded to any server — only text extracted in your browser is sent with the prompts.',
    docCv: 'CV / résumé',
    docCvHelp: 'Used by all three panelists to probe experience and consistency.',
    docStudyPlan: 'Study plan',
    docStudyPlanHelp: 'Primary material for the Academic panelist’s deep dive.',
    docProposal: 'Research proposal',
    docProposalHelp: 'Primary material for the Academic deep dive for doctoral applicants.',
    docEssay: 'Contribution essay',
    docEssayHelp:
      'Commitment to return to Indonesia and post-study contribution plan — the LPDP Team’s main focus.',
    dropzoneLabel: 'Drop a file here or click to choose',
    dropzoneHint: 'PDF, DOCX, or TXT · max {size}',
    pasteTab: 'Paste text',
    uploadTab: 'Upload file',
    pastePlaceholder: 'Paste your document contents here…',
    parsing: 'Extracting text…',
    parsedOk: '{words} words extracted from {pages} pages',
    parsedOkNoPages: '{words} words extracted',
    parseFailed: 'Could not read the file',
    previewTitle: 'Text preview',
    previewToggleShow: 'Show preview',
    previewToggleHide: 'Hide preview',
    truncatedNotice:
      'This document is longer than the {limit}-character limit. The middle will be summarised automatically before it reaches the panel.',
    emptyTextWarning:
      'No text could be extracted. If this is a scanned (image) PDF, copy the text manually into the “Paste text” tab.',
    scannedPdfHint:
      'This PDF appears to be a scan with no text layer. Use the “Paste text” tab instead.',

    reviewTitle: 'Review before starting',
    reviewSubtitle: 'Make sure everything is ready. You can go back and change anything.',
    reviewProfile: 'Profile',
    reviewDocuments: 'Documents',
    reviewLlm: 'LLM settings',
    reviewLlmReady: 'Endpoint and model configured',
    reviewLlmMissing: 'Not configured — the interview cannot start',
    reviewBudget: 'Estimated context',
    reviewBudgetValue: '{chars} characters of documents will be used by the panel',
    startInterview: 'Start the 60-minute interview',
    startInterviewShort: 'Start interview',
    blockedTitle: 'Not ready to start',
    missingProfileFields: 'Please complete: {fields}',
    missingDocs: 'Please add these documents: {docs}',
    missingLlm: 'Configure the LLM endpoint in Settings',
    existingSessionWarning:
      'You have an unfinished interview. Starting a new one will erase the old transcript.',
    existingSessionResume: 'Resume the old one',
    existingSessionDiscard: 'Start fresh',
    autoSavedNote: 'Changes are saved automatically in this browser.',
  },

  interview: {
    title: 'Interview session',
    connecting: 'Connecting to the panel…',
    panelPreparing: 'The panel is reading your documents…',
    phaseLabel: 'Phase',
    phaseProgress: 'Phase {current} of {total}',
    timeRemaining: 'Time remaining',
    timeElapsed: 'Time elapsed',
    overtime: 'Over time',
    inputPlaceholder: 'Type your answer…',
    inputPlaceholderWaiting: 'Wait for the panel to finish speaking…',
    send: 'Send',
    sendHint: 'Enter to send · Shift+Enter for a new line',
    inputModeText: 'Type',
    inputModeVoice: 'Voice',
    voiceStart: 'Start speaking',
    voiceStop: 'Stop listening',
    voiceListening: 'Listening… go ahead.',
    voiceIdleHint: 'Press the microphone and speak. You can edit the transcript after stopping.',
    voicePlaceholder: 'Your spoken answer will appear here.',
    voiceTranscriptLabel: 'Voice answer transcript',
    voiceDiscard: 'Discard transcript',
    voiceEditableNote:
      'Voice answers are transcribed automatically. Review and edit them after you stop speaking, before sending.',
    voicePrivacyNote:
      'Transcription is handled by your browser’s built-in service; this app only uses the resulting text.',
    voiceDenied:
      'Microphone access was denied. Allow the microphone for this site in your browser, or use typing mode.',
    voiceNetwork:
      'The browser’s transcription service failed due to a network problem. Try again or use typing mode.',
    voiceOtherError: 'Voice input stopped. Try again or use typing mode.',
    voiceUnsupported: 'This browser does not support voice input. Use typing mode.',
    thinking: 'is composing a question…',
    typing: 'is speaking…',
    endEarly: 'End early',
    endEarlyConfirmTitle: 'End the interview now?',
    endEarlyConfirmBody:
      'The panel will close the session immediately and the report will be built from the answers so far. This cannot be undone.',
    endEarlyConfirm: 'Yes, end and score',
    wrappingUp: 'The panel is wrapping up…',
    finishing: 'Building your assessment report…',
    finished: 'Interview finished',
    finishedSessionBody:
      'Your previous interview session has finished. View your assessment report, or start a new interview.',
    finishedSessionDuration: 'Duration: {duration} · {answers}',
    startNewSession: 'Start a new interview',
    viewReport: 'View report',
    noSessionTitle: 'No interview session yet',
    noSessionBody: 'Complete the setup first to start an interview.',
    noSessionCta: 'Go to setup',
    recoveredTitle: 'Session restored',
    recoveredBody: 'Your interview resumed from the last point saved in this browser.',
    pausedTitle: 'Session paused',
    pause: 'Pause',
    resume: 'Resume',
    languageSwitchNotice: 'The panelist switched to English.',
    languageSwitchBackNotice: 'The panelist switched back to Bahasa Indonesia.',
    errorTitle: 'Could not reach the model',
    errorRetry: 'Retry',
    errorSkipTurn: 'Skip this turn',
    errorEndSession: 'End and score now',
    rateLimited: 'The endpoint is rate-limiting requests. Wait a moment and retry.',
    authFailed:
      'The endpoint rejected your API key. Check the key and base URL in Settings.',
    networkFailed:
      'The request failed — check your connection and whether the endpoint allows browser access (CORS).',
    streamInterrupted: 'The answer stream was cut off midway. You can retry.',
    noteTakerFailed:
      'Scoring notes for this answer could not be generated. The interview continues; the report will be slightly less detailed.',
    transcriptTitle: 'Transcript',
    turnCount: '{count} exchanges',
    answersCount: '{count} answers from you',
    autoSaveNote: 'Saved automatically',
    clockPausedNote: 'The timer keeps running even when the tab is inactive.',
    phaseNudge: 'The panel moves to the next phase.',
    closingStatementPrompt: 'This is your last chance — give your closing statement.',
  },

  phases: {
    opening: {
      name: 'Opening & self-introduction',
      goal: 'The panel introduces itself and asks you to introduce yourself briefly.',
    },
    motivation: {
      name: 'Background & study motivation',
      goal: 'Exploring why you are pursuing this degree, your choice of field, and your journey so far.',
    },
    studyPlan: {
      name: 'Study plan / research proposal',
      goal: 'Academic deep dive, including research feasibility and programme fit.',
    },
    personality: {
      name: 'Personality, readiness & consistency',
      goal: 'The psychologist tests resilience, personal readiness, and consistency with your documents.',
    },
    contribution: {
      name: 'Nationalism & contribution plan',
      goal: 'The LPDP Team tests your commitment to return and your measurable contribution plan.',
    },
    closing: {
      name: 'Closing questions & statement',
      goal: 'Final questions from the panel and your closing statement.',
    },
  },

  settings: {
    title: 'Settings',
    subtitle:
      'This app uses your own API key (BYOK). The key is stored only in this browser and sent only to the endpoint you specify.',
    llmSectionTitle: 'LLM endpoint',
    presetLabel: 'Provider preset',
    presetCustom: 'Custom',
    presetHelp: 'Choosing a preset fills in the base URL and a suggested model.',
    baseUrlLabel: 'Base URL',
    baseUrlHelp:
      'Must be an OpenAI-compatible endpoint, usually ending in /v1. Example: https://api.openai.com/v1',
    apiKeyLabel: 'API key',
    apiKeyHelp: 'Stored in this browser’s localStorage only.',
    apiKeyPlaceholder: 'sk-…',
    apiKeyStored: 'A key is stored in this browser',
    apiKeyNotNeeded: 'This preset usually does not need a key.',
    modelLabel: 'Model',
    modelHelp: 'Main model for the panelists and the report.',
    modelSuggested: 'Suggested: {model}',
    cheapModelLabel: 'Light model (moderator & notes)',
    cheapModelHelp:
      'Used for small, frequent steps: choosing the next speaker and taking scoring notes. Leave empty to use the main model.',
    temperatureLabel: 'Temperature',
    temperatureHelp: 'Lower is more consistent. 0.7 is recommended for interviews.',
    testConnection: 'Test connection',
    testing: 'Testing…',
    testSuccess: 'Success. The model replied: “{reply}”',
    testFailed: 'Failed: {error}',
    testMissingFields: 'Fill in the base URL and model first.',
    clearKey: 'Clear API key',
    clearAll: 'Clear all app data',
    clearAllConfirm:
      'Delete the API key, profile, documents, transcript, and report from this browser? This cannot be undone.',
    clearedAll: 'All app data in this browser has been deleted.',
    safetyTitle: 'API key safety',
    safetyPoints: [
      'Your key is stored in this browser’s localStorage, not on our servers — we do not have any.',
      'The key is attached only to requests to the base URL you configured, never to third parties.',
      'Use a separate project key with a spend limit, then revoke it when you are done.',
      'Avoid public or shared devices. Wipe it with the “Clear API key” button.',
      'The endpoint you use must allow requests from browsers (CORS).',
    ],
    dataSectionTitle: 'Data in this browser',
    dataProfile: 'Applicant profile',
    dataDocuments: 'Documents',
    dataInterview: 'Interview session',
    dataReport: 'Report',
    dataPresent: 'Present',
    dataAbsent: 'Empty',
    dataSizeNote: 'About {size} used in localStorage.',
    localeSectionTitle: 'Interface language',
    localeHelp:
      'Changes the interface language. The interview language is set separately on the Setup page.',
    corsNoteTitle: 'CORS note',
    corsNoteBody:
      'OpenAI, OpenRouter, and Groq allow direct browser requests. For Ollama, start it with OLLAMA_ORIGINS="*" so the browser is permitted.',
  },

  presets: {
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    groq: 'Groq',
    ollama: 'Ollama (local)',
    lmstudio: 'LM Studio (local)',
  },

  report: {
    title: 'Assessment report',
    subtitle: 'Built from your interview transcript and the 8-dimension scoring rubric.',
    generating: 'Building the report…',
    generatingStep: '{step} of {total}: {label}',
    stepScoring: 'Scoring rubric dimensions',
    stepNarrative: 'Writing panelist notes',
    stepSignals: 'Checking strong/weak signals',
    stepNextSteps: 'Drafting improvement steps',
    generateFailed: 'Could not build the report',
    regenerate: 'Rebuild report',
    regenerateUnavailable:
      'Only the last interview session still saved in this browser can be rebuilt.',
    historyTitle: 'Report history',
    historySubtitle: '{count} interview sessions saved in this browser.',
    historyAnswers: '{count} answers',
    historyLatest: 'Latest',
    historyView: 'View report',
    historyDelete: 'Delete report',
    historyDeleteConfirm:
      'Delete this report from the history? This cannot be undone.',
    noReportTitle: 'No report yet',
    noReportBody: 'Complete an interview session to get an assessment report.',
    noReportCta: 'Start setup',
    totalScore: 'Total score',
    ofHundred: 'out of 100',
    band: 'Recommendation',
    dimensionsTitle: 'Scores by dimension',
    dimensionTable: {
      dimension: 'Dimension',
      owner: 'Assessor',
      weight: 'Weight',
      score: 'Score',
      weighted: 'Points',
    },
    evidenceTitle: 'Evidence quotes',
    evidenceEmpty: 'No specific quotes were recorded for this dimension.',
    strengthsTitle: 'Strengths',
    weaknessesTitle: 'Needs improvement',
    panelNotesTitle: 'Panelist notes',
    signalsTitle: 'Strong & weak candidate signals',
    signalsSubtitle: 'Checked against LPDP’s public guidance on Seleksi Substansi preparation.',
    signalStrong: 'Present',
    signalPartial: 'Partial',
    signalMissing: 'Not seen',
    signalStrongTitle: 'Strong-candidate signals',
    signalWeakTitle: 'Weak-candidate signals',
    signalWeakPresent: 'Detected',
    signalWeakAbsent: 'Not detected',
    nextStepsTitle: 'Improvement steps',
    transcriptTitle: 'Full transcript',
    transcriptToggleShow: 'Show transcript',
    transcriptToggleHide: 'Hide transcript',
    metaTitle: 'Session details',
    metaDate: 'Date',
    metaDuration: 'Duration',
    metaModel: 'Model',
    metaPhasesCovered: 'Phases reached',
    metaAnswers: 'Answers given',
    downloadMarkdown: 'Download Markdown',
    printPdf: 'Print / save as PDF',
    scoreLabels: {
      1: 'Poor',
      2: 'Fair',
      3: 'Good',
      4: 'Excellent',
    },
  },

  bands: {
    sangat: {
      label: 'Strongly Recommended',
      description:
        'Answers are consistent, specific, and convincing across almost every dimension. Maintain this and polish delivery.',
    },
    direkomendasikan: {
      label: 'Recommended',
      description:
        'A strong foundation with a few gaps that can still be closed before the real interview.',
    },
    dipertimbangkan: {
      label: 'Under Consideration',
      description:
        'There is good raw material, but several important dimensions remain generic or short on concrete evidence.',
    },
    belum: {
      label: 'Not Yet Recommended',
      description:
        'Fundamental work is needed on answer structure, concreteness of plans, and evidence of experience.',
    },
  },

  rubric: {
    studyPlan: {
      name: 'Study/research plan & academic readiness',
      description:
        'Clarity and feasibility of the study plan or research proposal, methodological readiness, and understanding of the workload.',
    },
    fieldMastery: {
      name: 'Field mastery & programme-career fit',
      description:
        'Depth of understanding of the field and how well the target programme connects to your track record and career plan.',
    },
    communication: {
      name: 'English ability (if overseas) / communication',
      description:
        'Clarity, structure, and coherence of delivery; for overseas destinations this includes English fluency.',
    },
    motivation: {
      name: 'Motivation & authenticity',
      description:
        'Strength and genuineness of your reasons for further study — specific and personal rather than generic or rehearsed.',
    },
    resilience: {
      name: 'Personality, resilience & psychological readiness',
      description:
        'Self-awareness, how you handle pressure and failure, and personal and family readiness for the study period.',
    },
    consistency: {
      name: 'Consistency of answers vs documents',
      description:
        'Alignment of spoken answers with the CV, study plan, and contribution essay; no claims that wobble under probing.',
    },
    nationalism: {
      name: 'Nationalism & commitment to return to Indonesia',
      description:
        'Seriousness of your commitment to return and serve, and your grasp of national context and priorities.',
    },
    contribution: {
      name: 'Contribution plan: concrete & measurable',
      description:
        'Post-study contribution plan with clear targets, metrics, timelines, and stakeholders.',
    },
  },

  signals: {
    strong: [
      'Structured, connected flow of ideas',
      'Demonstrates leadership qualities',
      'Concrete examples and strong experiences',
      'Professional demeanour with an enthusiastic tone',
      'Ambitious and measurable future plans, including the how',
      'Authentic answers; unique experiences relevant to academic goals',
      'Confidently highlights key achievements',
      'Concrete, dedicated plan to give back to society',
      'Genuine passion for the chosen field',
    ],
    weak: [
      'Unstructured, unfocused delivery',
      'Low enthusiasm, hesitant tone',
      'Sounds scripted or memorised, repetitive answers',
      'Self-promotion without substance or achievements',
      'Normative, overly general answers',
      'Vague or unconvincing contribution plan',
      'Future plans without specific, measurable steps',
    ],
  },

  privacy: {
    title: 'Privacy & security',
    subtitle: 'What happens to your documents, transcripts, and API key.',
    sections: [
      {
        title: 'We run no server',
        body: 'This app is a bundle of static files (HTML/CSS/JS) served by GitHub Pages. There is no backend, no API route, and no database belonging to this project. So there is nowhere for us to store your data.',
      },
      {
        title: 'Documents are parsed in the browser',
        body: 'PDFs are read with pdfjs-dist and DOCX with mammoth, both running in your browser. Original files are never uploaded anywhere. Only relevant text excerpts are included in prompts to the LLM endpoint you choose.',
      },
      {
        title: 'Your API key stays in your browser',
        body: 'The key is stored in localStorage and attached only to requests going to the base URL you configured yourself. It is never sent to any other domain, including to this project’s maintainers.',
      },
      {
        title: 'No content-capturing analytics',
        body: 'There is no telemetry, no third-party tracker, and no logging that captures your document contents, interview answers, or key.',
      },
      {
        title: 'Third-party data: your LLM provider',
        body: 'Your prompts and answers are sent to the LLM endpoint you select and are subject to that provider’s privacy policy. If you want to stay fully offline, use a local model such as Ollama or LM Studio.',
      },
      {
        title: 'Voice mode uses your browser’s service',
        body: 'When you answer in voice mode, transcription is handled by your browser’s built-in speech recognition service (for example Google’s service in Chrome). This app only receives the resulting text; audio is never sent to the LLM endpoint or to this project. Use typing mode if you want to stay fully offline.',
      },
      {
        title: 'Deleting your data',
        body: 'The “Clear all app data” button in Settings removes your profile, documents, transcript, report, and API key from this browser. Clearing site data in your browser also removes everything.',
      },
    ],
  },

  footer: {
    builtWith: 'Built with Next.js, running entirely in your browser.',
    sourceCode: 'Source code',
    license: 'MIT License',
    privacy: 'Privacy',
    lpdpSourceNote: 'Scoring criteria follow LPDP’s public guidance.',
    lpdpSourceLink: 'LPDP Seleksi Substansi guidance',
  },

  errors: {
    notFoundTitle: 'Page not found',
    notFoundBody: 'The link you opened does not exist or has moved.',
    notFoundCta: 'Back to home',
    genericTitle: 'Something went wrong',
    genericBody: 'Try reloading the page. Your data in this browser is safe.',
    reload: 'Reload',
    missingSettingsTitle: 'LLM settings incomplete',
    missingSettingsBody:
      'Fill in the base URL, API key, and model in Settings before continuing.',
    missingSettingsCta: 'Go to Settings',
    storageFullTitle: 'Browser storage is full',
    storageFullBody:
      'The transcript could not be saved because localStorage is full. Delete old app data or reduce document sizes.',
  },
};

const COPY: Record<Locale, Copy> = { id, en };

/** Pure accessor for the copy tree — safe in tests and non-React modules. */
export function getCopy(locale: Locale): Copy {
  return COPY[locale] ?? COPY[DEFAULT_LOCALE];
}

export function isLocale(value: unknown): value is Locale {
  return value === 'id' || value === 'en';
}

/**
 * Interpolate `{placeholder}` tokens in a copy string.
 *
 * `t('{chars} karakter', { chars: 1200 })` → `'1200 karakter'`.
 * Unknown placeholders are left untouched so bugs stay visible.
 */
export function format(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
