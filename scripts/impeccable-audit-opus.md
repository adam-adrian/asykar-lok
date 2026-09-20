# Audit Impeccable: League of Kindness — "Escape the Template Prison"

**Target:** `/home/neikami/Proyek/asykar/index.html` + `css/style.css`
**Mode:** Operate (Dashboard / Admin untuk pembina pesantren)
**Method:** ⚠️ DEGRADED: single-context (audit customisasi, bukan $impeccable critique formal)

---

## 1. DESIGN HEALTH SCORE (Nielsen's 10 Heuristics)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Sync badge ada tapi loading/success state pada CRUD hanya toast transient. Tidak ada skeleton loading. Table kosong cuma "–" |
| 2 | Match System / Real World | 3 | Bahasa pesantren cukup natural ("Sakan", "Kebersihan"). Salam Arab di hero cocok. Istilah "Ledger" di class names bocor ke UX mental model tapi tidak ke UI copy |
| 3 | User 
Audit selesai. Laporan tersimpan di dua tempat:
- Artifact: lihat di atas
- Proyek: [scripts/impeccable-audit-opus.md](file:///home/neikami/Proyek/asykar/scripts/impeccable-audit-opus.md)

---

**Ringkasan brutal:**

**Skor: 19/40 (Poor).** UI ini bukan desain — ini perakitan template. Ganti teks "League of Kindness" dengan nama produk apapun, dan tidak ada yang perlu diubah secara visual.

**Penyakit utama** (sesuai dugaan kamu):
1. **Nested card prison** — 3 level bordered cards di mana-mana, semuanya `border + shadow + radius`. craft-floor.md: *"nested cards are always wrong"*
2. **Zero design specificity** — tidak ada satu elemen pun yang berkata "ini untuk liga kehormatan pesantren"
3. **Eyebrow violations** — 4 instance, yang oleh craft-floor.md disebut **ban absolute**
4. **Ghost cards** — `border + shadow` duplikat di ~15 komponen
5. **6 modals untuk 4 halaman** — operate.md: *"Modals are usually laziness"*

**Solusi bukan tweak warna.** Solusinya adalah *tear down the card prison*: konten mengalir di continuous surface, distrukturkan oleh whitespace + tipografi + divider, bukan kotak ber-border berlapis-lapis. Satu-satunya bagian yang sudah "authored" (podium 3-teratas) seharusnya jadi *baseline karakter visual* untuk seluruh app, bukan pengecualian.

Roadmap di laporan sudah dipecah ke 4 fase — Fase 1-3 bisa dikerjakan tanpa menyentuh JavaScript logic sama sekali.
Oke, kamu skip pertanyaan — berarti audit ini sudah cukup untuk sekarang. Laporan lengkap ada di artifact dan di [scripts/impeccable-audit-opus.md](file:///home/neikami/Proyek/asykar/scripts/impeccable-audit-opus.md). Kapanpun mau mulai eksekusi, tinggal bilang fase mana yang mau diterjang duluan.
User approved, proceeding to execution. Saya mulai Fase 1 (Distill) + Fase 2 (Layout Beranda) sekaligus. Pertama, cek JS dependencies untuk memastikan edit aman:
JS tidak reference class names `dash-widget-box`, `dash-metric-card`, `dash-hero`, `stat-row` langsung — semua pakai element IDs. Aman untuk restructure CSS dan HTML wrapper tanpa breaking JS.

Sekarang saya launch parallel subagents untuk CSS dan HTML:
Kedua subagent sedang bekerja paralel — satu di CSS, satu di HTML. Saya tunggu hasilnya.
Menunggu subagent menyelesaikan edit CSS dan HTML...
ard.
- Halaman Liga: `ledger` membungkus `bracket-match-box` (lagi nested card), yang di dalamnya ada `bracket-team` (Level 3 mini-card).
- 4 `dash-metric-card` masing-masing punya `dash-metric-icon` yang juga ber-border dan radius — kotak-di-dalam-kotak-di-dalam-kotak.

**Akibat:** 3 layer elevasi visual (canvas → card → float-card) yang setiap layer-nya punya `border: 1px solid` + `border-radius` + `box-shadow`. Mata tidak bisa beristirahat. Setiap elemen "berteriak" meminta perhatian yang sama.

### 2.2 The Hero-Metric Template

craft-floor.md: *"The hero-metric template: big number, small label, supporting stats, accent."*

Persis yang ada di `dash-metrics-grid`: 4 buah kotak identik, masing-masing berisi icon box (40×40px, background tinted, bordered) + label UPPERCASE + angka bold. Template ini *is the disease*. Dikopi lagi di halaman Klasemen sebagai `stat-row` (4 stat box identik dengan angka Fraunces besar + label kecil).

**Total:** 8 hero-metric boxes seragam di 2 halaman berbeda.

### 2.3 Three-Column Identical Widget Scaffold

`dash-widgets-grid` memaksa 3 widget ke dalam format yang *persis sama*:
- `.dash-widget-head` (icon + title + subtitle + "Lihat Detail →")
- `.dash-widget-body` (konten dinamis)

Ketiganya punya border, shadow, dan border-radius identik. Padahal **kontennya sangat berbeda**: Klasemen butuh highlight juara, Turnamen butuh timeline match, Agenda butuh calendar. Tapi semuanya diperas ke dalam mould kartu yang sama. Ini "framework default", bukan keputusan desain.

### 2.4 Eyebrow / Kicker di atas Heading

craft-floor.md: *"A kicker or eyebrow above a heading. This one is a ban, not a default: no brief earns it back."*

**Pelanggaran langsung:**
- `dash-greeting-eyebrow` (السَّلَامُ عَلَيْكُمْ) di atas `dash-greeting-title` (Ahlan wa Sahlan) — eyebrow
- `.podium-wrap .eyebrow` ("Sorotan (Berdasarkan Rata-rata Tiga Aspek)") di atas "Tiga Sakan Teratas" — literal class name `eyebrow`
- `dash-mvp-badge` ("⭐ SAKAN TELADAN") di atas nama MVP — eyebrow/kicker
- `dash-widget-sub` ("Kebersihan, Kedisiplinan, Bahasa") di bawah setiap widget heading — mungkin bukan eyebrow tapi redundant subtitle yang heading-nya sendiri sudah jelas

### 2.5 Border Everywhere + Border+Shadow Double Declaration

craft-floor.md: *"Declare elevation once, border or shadow. A 1px border under a wide soft shadow is the ghost card."*

**Audit CSS shows:**
- `dash-hero`: `border: 1px solid var(--line)` + `box-shadow: var(--shadow)` — ghost card
- `dash-metric-card`: `border: 1px solid var(--line)` + `box-shadow: 0 4px 15px rgba(0,0,0,.03)` — ghost card
- `dash-widget-box`: `border: 1px solid var(--line)` + `box-shadow: var(--shadow)` — ghost card
- `ledger`: `border: 1px solid var(--line)` — lalu di dalamnya `bracket-match-box` juga `border: 1px solid var(--line)` + `box-shadow: 0 2px 8px` — ghost card nested di bordered card
- `toolbar`: `border: 1px solid var(--line)` — another bordered box
- `stat`: `border: 1px solid var(--line)` — another bordered box
- Setiap `modal-box`: `border: 1px solid var(--line)` + `box-shadow` — ghost card

Total: **~15 distinct components** yang semuanya memakai `border: 1px solid + box-shadow/border-radius`.

---

## 3. AUDIT PER LAYAR

### 3.1 Beranda (Dashboard)

**Masalah arsitektural:**

1. **Hero greeting tidak heroik.** Card ber-border berisi salam + subtitle + tombol sync. Ini bukan hero, ini notification bar yang diberi ukuran besar. Tidak ada perasaan "memasuki ruang yang megah". Bandingkan: sebuah pesantren punya *wibawa*. Hero ini terasa seperti header email newsletter.

2. **4 metric cards = zero information hierarchy.** Keempat kartu punya bobot visual identik. "16 Sakan Terdaftar" (statis, jarang berubah) punya prominence yang sama dengan "Pemimpin Kebaikan" (dinamis, menarik). Seharusnya pemimpin kebaikan adalah *headline*, bukan kotak kecil di samping jumlah sakan.

3. **3 widget columns = admin dashboard scaffold.** Masing-masing punya header-bar + body + "Lihat Detail →". Ini pola Notion/Linear/admin-template yang mekanis. Untuk "Liga Kebaikan" yang kontennya tentang *prestasi santri, laga seru, dan kegiatan pesantren*, format ini menghilangkan semua kehangatan dan kebanggaan.

**Seharusnya:**
- Hero greeting sebagai *continuous surface* yang langsung mengalir ke konten utama. Salam Arab cukup sebagai elemen inline kecil di dalam greeting, bukan eyebrow terpisah.
- "Pemimpin Kebaikan" adalah spotlight utama halaman — nama sakan + skor besar, berdiri sendiri tanpa perlu kotak.
- Metric lainnya (jumlah sakan, laga, agenda) cukup jadi inline indicators di sekitar konten — bukan 4 kotak sejajar.
- Widget Klasemen top-3 langsung tampil sebagai ranked list, bukan card-di-dalam-card.
- Turnamen mendatang muncul sebagai *satu* highlight laga berikutnya, bukan mini-card di dalam widget card.
- Agenda: 2-3 item terdekat sebagai plain list items, bukan date-box + card di dalam widget card.

### 3.2 Klasemen Kebaikan (#klasemen)

**Masalah arsitektural:**

1. **Toolbar card.** Filter tanggal + search dibungkus dalam `toolbar` yang lagi-lagi punya `background:var(--card); border:1px solid var(--line); border-radius:var(--radius)`. Filter bar seharusnya bagian dari page flow, bukan kotak terpisah.

2. **4 stat boxes lagi.** Hero-metric template terulang. Rata-rata Kebersihan, Kedisiplinan, Bahasa, Keseluruhan — 4 kotak identik. Data ini berguna tapi penyajiannya kaku. Bisa jadi inline horizontal strip tanpa border individu.

3. **Podium wrap.** Ini bagian paling "authored" di seluruh app — dark background, podium 3 level. *Tapi:* diawali eyebrow yang dilarang, dan memakai gradient gold yang benar tapi tidak memiliki *keagungan*. Podium block cuma `border-radius: 10px 10px 0 0` dengan warna solid. Tidak ada rasa "penghargaan besar".

4. **Ledger card membungkus tabel.** `ledger` = card (`background:var(--card); border:1px solid var(--line); border-radius:var(--radius)`) yang berisi `table`. Tabel itu sendiri sudah memiliki `thead` dengan `border-bottom:1.5px solid var(--line)` dan `tbody td` dengan `border-bottom:1px solid #EFE9D6`. Total border lines: card border atas + card border bawah + header border + setiap row border. *Lima level garis* dari atas sampai bawah.

**Seharusnya:**
- Klasemen kebaikan bukan spreadsheet. Ini *catatan adab*. Bayangkan sebuah perkamen terbuka di meja kepala pembina.
- Tabel bisa bernapas dengan: hapus container card (table langsung di page surface), hapus row borders (gunakan alternating row tinting atau spacing saja), biarkan data berbicara melalui tipografi.
- Stat strip: satu baris horizontal tanpa kotak terpisah, angka dan label inline.
- Podium: beri "authored moment" yang sebenarnya. Tipografi besar untuk nama juara. Kontras nyata. Bukan kotak gradient kecil.

### 3.3 Turnamen Bola (#liga)

**Masalah arsitektural:**

1. **Dua panel (Jadwal + Hasil) dibungkus `ledger` cards.** Lagi — card membungkus konten yang seharusnya stand-alone.

2. **Bracket tree.** Ini sebenarnya konsep yang bagus (`bracket-tree-wrap` → `bracket-round-col` → `bracket-match-box`). Tapi implementasinya masih... `bracket-match-box` punya `border + shadow + radius`, di dalamnya `bracket-team` punya `border + radius + background`. Nested bordered boxes lagi.

3. **Champion box.** Gradient gold, shadow, border putih — ini salah satu elemen paling "authored" tapi dibatasi oleh konteks bracket tree yang sempit. Champion showcase seharusnya *meledak* keluar dari grid.

4. **Rekap tabel skor.** Desktop table + mobile cards (hidden). Ini pattern responsive yang benar tapi kedua representasi tetap dalam `card → bordered items` template.

**Seharusnya:**
- Bracket tree bisa jadi *the star* halaman ini. Biarkan garis koneksi antar match mengalir. Hapus border dari match box — gunakan background shade + tipografi kontras saja.
- Champion showcase: full-width celebration moment, bukan kotak kecil di ujung bracket.
- Jadwal: simple timeline / list, tidak perlu dibungkus ledger card.

### 3.4 Jadwal & Dokumentasi Agenda (#event)

**Masalah arsitektural:**

1. Setiap event = `event-card` dengan `border + radius + shadow`. List of cards yang seragam — mirip list email atau list tweet. Tidak ada pembedaan prioritas antara event hari ini vs event bulan depan.

2. Date box (`.event-date-box`) sudah dark background + rounded, lalu card-nya juga bordered. Dobel container lagi.

**Seharusnya:**
- Timeline vertikal atau grouped-by-month list. Event mendatang (hari ini/besok) punya visual prominence berbeda dari event jauh.
- Foto/poster dokumentasi bisa jadi hero image mini, bukan thumbnail 76×76px yang terjepit.

### 3.5 Modal Dialogs

**Hitungan modal:**
- `modalKlasemen` — tambah/edit poin
- `modalKlasemenBulk` — input massal (modal-lg)
- `modalLiga` — jadwal + input skor pertandingan
- `modalEvent` — tambah agenda + upload foto
- `loginModal` — login admin
- `imageLightbox` — perbesar gambar

**Masalah:**
- **6 modals** untuk sebuah app dengan 4 halaman. operate.md: *"Modal as first thought. Modals are usually laziness. Exhaust inline / progressive alternatives first."*
- Input klasemen satuan bisa jadi inline expand di row tabel. Input massal bisa jadi dedicated sub-view, bukan modal 720px.
- Modal Liga menggabungkan "jadwalkan pertandingan" dan "input skor" dalam satu form dengan section yang di-toggle — ini overloaded.

---

## 4. COGNITIVE LOAD ASSESSMENT

| Checklist Item | Status | Evidence |
|---|---|---|
| Single focus | ❌ FAIL | Beranda: hero + 4 metric + 3 widget = 8 distinct attention points sekaligus |
| Chunking | ❌ FAIL | 4 metric cards + 3 widget cards + hero + footer = 9 chunks di viewport scroll |
| Grouping | ⚠️ PARTIAL | Items within widgets grouped okay, tapi grouping antar widget lemah karena semua punya treatment visual identik |
| Visual hierarchy | ❌ FAIL | Tidak ada focal point. Hero, metrics, widgets semua punya bobot visual setara |
| One thing at a time | ⚠️ PARTIAL | Navigasi per-halaman OK, tapi di dalam setiap halaman terlalu banyak yang disajikan sekaligus |
| Minimal choices | ✅ PASS | Navigasi utama 4 item. Decision points reasonable |
| Working memory | ✅ PASS | Tidak perlu mengingat info lintas halaman |
| Progressive disclosure | ❌ FAIL | Semua ditampilkan sekaligus. Tidak ada expand/collapse. Bulk input tersembunyi tapi bukan progressive disclosure — itu hidden feature |

**Cognitive Load Score: 4 failures = HIGH (Critical fix needed)**

**Visual Noise Floor:** Border berlapis dari card nesting menciptakan *noise floor* tinggi. Ketika setiap elemen punya border 1px + shadow + radius, sistem depth kehilangan makna. Tidak ada yang "naik" karena semuanya sudah "di atas".

---

## 5. PERSONA RED FLAGS

### Alex (Power User / Pembina Senior)

- **Tidak ada keyboard shortcut.** Pembina yang input poin harian untuk 16 sakan harus klik "Tambah Poin" → modal → pilih sakan → isi 3 field → simpan → repeat. Zero batch efficiency tanpa fitur bulk (yang juga modal).
- **Bulk input massal ada tapi lewat modal 720px** yang scroll di dalam modal. Bukan inline table edit.
- **Tidak ada Esc handler** yang konsisten pada modal. `onclick="closeModal()"` saja.
- **Tidak ada konfirmasi before destructive delete.** Icon-btn danger langsung menghapus (berdasarkan pattern HTML — konfirmasi via JS `confirm()` perlu dicek di app.js).

### Jordan (First-Timer / Wali Santri yang Baru Lihat)

- **"Ahlan wa Sahlan" + salam Arab** tidak menjelaskan apa ini. Visitor baru yang bukan dari pesantren akan bingung. Subtitle "Pusat Informasi Terpadu Liga Kebaikan Pesantren" menjelaskan tapi itu teks kecil 13.5px di bawah heading 30px.
- **Tidak ada onboarding** atau penjelasan flow. Apa itu "Sakan"? Apa itu "Poin Kebersihan"? Pembina baru perlu training offline karena app tidak menjelaskan apapun.
- **Help = 0.** Tidak ada tooltip, hint, atau panduan.

### Casey (Santri yang Lihat di HP)

- **Bottom nav sudah bagus** — 4 item, icon + label, proper thumb zone.
- **Tabel klasemen di mobile:** `overflow-x: auto` dengan `min-width: 650px` — horizontal scroll. Ini painful di HP kecil. 7 kolom data di layar 375px width.
- **Metric cards 2×2 di mobile** — acceptable tapi masih bordered boxes.
- **Touch target pada `icon-btn` (32×32px)** sedikit di bawah rekomendasi 44×44pt untuk edit/delete buttons.

---

## 6. WHAT'S WORKING

1. **Palet warna.** Token system (ink, canvas, surface, gold, clay, green, ochre) *is genuinely well-constructed*. Kontras ratios sudah dihitung WCAG AA. Ini pondasi solid. Masalahnya bukan warna — masalahnya adalah cara warna ini *diaplikasikan* (semuanya ke border dan shadow).

2. **Font pairing.** Fraunces (serif display) + Inter (sans body/UI) adalah pasangan yang layak. Fraunces punya karakter klasik yang cocok untuk "Liga Kebaikan". Sayang dipakai terlalu timid — hanya di heading dan angka, tidak membentuk *suasana*.

3. **Podium 3-teratas.** Konsep dark-background podium dengan 3 blok ketinggian berbeda menunjukkan bahwa desainer *bisa* membuat authored moment. Ini satu-satunya bagian yang terasa seperti "didesain untuk Liga Kebaikan", bukan dirakit dari template.

---

## 7. PRIORITY ISSUES

### [P1] Nested Card Prison — Arsitektur Layout Fundamental Rusak

**What:** Seluruh UI dibangun dari `card > card > card`. Setiap section, widget, toolbar, tabel, match box dibungkus bordered card. 3 level depth tanpa makna.

**Why it matters:** Pembina yang membuka app ini tidak melihat "Liga Kebaikan" — mereka melihat dashboard admin SaaS generik. Tidak ada *authored character*. Setiap komponen berteriak sama keras karena semuanya punya border+shadow+radius identik. Cognitive load tinggi karena grouping terdistorsi oleh container berlapis.

**Fix:**
- Hapus card wrapper dari `toolbar`, `stat-row`, `ledger`. Biarkan konten langsung berada di page surface (`--canvas`).
- Gunakan `spacing + tipografi + divider` untuk grouping, bukan bordered box.
- Pilih: border ATAU shadow. Jangan dua-duanya. Untuk Operate mode, tipis shadow saja lebih clean.
- Widget dashboard: hapus uniform `dash-widget-box` wrapper. Setiap konten berdiri sendiri dengan heading tipografi sebagai separator.
- Tabel: hapus `ledger` card. `thead` dan `td` sudah cukup menstrukturkan data.

### [P1] Absence of Design Specificity — Tidak Ada "Authored Character"

**What:** UI ini bisa dipakai untuk aplikasi apapun tanpa perubahan struktural. Tidak ada elemen yang membuat kamu berpikir "oh ini untuk pesantren", "oh ini liga kebaikan", "oh ini sesuatu yang bermartabat".

**Why it matters:** League of Kindness bukan sekadar tracker poin. Ini sistem kehormatan pesantren. Desainnya harus membawa *wibawa dan kebanggaan*, bukan kesan "form data entry".

**Fix:**
- Hero beranda: continuous dark surface (--ink background) yang megah, greeting besar, langsung menampilkan "siapa yang memimpin hari ini" sebagai spotlight.
- Klasemen: hapus kesan spreadsheet, hadirkan sebagai "perkamen catatan adab" — tipografi serif dominan, spacing lega, rank numbers yang prominent.
- Bracket turnamen: garis koneksi visual antar babak, champion showcase yang meledak visual.
- Gunakan Fraunces lebih berani — size lebih besar, weight lebih varied, untuk menciptakan *suasana* manuskrip/kitab.

### [P1] Eyebrow/Kicker Pattern — Explicitly Banned

**What:** 4+ instance eyebrow di atas heading: `dash-greeting-eyebrow`, `.eyebrow` di podium, `dash-mvp-badge`, dan beberapa widget subtitle.

**Why it matters:** craft-floor.md menyebutnya ban absolute. Eyebrow melemahkan heading di bawahnya. Heading harus berdiri sendiri tanpa label penjelas di atasnya.

**Fix:**
- Hapus `dash-greeting-eyebrow`. Salam Arab bisa jadi bagian *dalam* greeting ("Ahlan wa Sahlan, السَّلَامُ عَلَيْكُمْ"), bukan label terpisah.
- Hapus `.eyebrow` pada podium. "Tiga Sakan Teratas" sudah cukup jelas. "Sorotan (Berdasarkan Rata-rata Tiga Aspek)" itu redundant context.
- `dash-mvp-badge`: integrasikan ke dalam MVP card context, bukan label terpisah di atas nama.

### [P2] Modal Overload — 6 Modals untuk 4 Halaman

**What:** Setiap create/edit action dialihkan ke modal dialog. operate.md: modals are usually laziness.

**Why it matters:** Context switch berulang. User kehilangan posisi scroll. Cognitive load meningkat karena harus mental-switch antara page context dan modal context.

**Fix:**
- Input klasemen satuan: inline expand di bawah tabel row terakhir, atau slide-in panel.
- Input massal: dedicated sub-view (bukan modal 720px), bisa jadi halaman/panel sendiri.
- Liga modal: pisah "jadwalkan" dan "input skor" jadi dua inline interactions, bukan satu multi-mode modal.
- Event modal: inline form di atas event list, collapse setelah save.
- Pertahankan login modal (memang butuh interruption) dan lightbox (memang butuh focus).

### [P2] Border+Shadow Double Declaration Everywhere

**What:** ~15 komponen memiliki `border: 1px solid` + `box-shadow` sekaligus. craft-floor.md: *"A 1px border under a wide soft shadow is the ghost card."*

**Fix:**
- Audit setiap komponen: pilih border SAJA (untuk container struktural) atau shadow SAJA (untuk floating elements).
- Page-level containers (toolbar, ledger, stat-row): hapus border dan shadow. Gunakan spacing saja.
- Floating elements (modal, dropdown, toast): shadow saja, tanpa border.
- Widget items (match box, event item, runner-up): kalau sudah di dalam section yang jelas, tidak perlu border individu. Gunakan spacing + divider line.

---

## 8. CETAK BIRU REKONSTRUKSI ARSITEKTUR VISUAL

### 8.1 Prinsip Utama: "Continuous Surface over Box Prison"

Alih-alih membungkus setiap konten dalam kotak ber-border, konten mengalir di atas *satu permukaan kontinu* (page canvas). Pemisahan terjadi melalui:
- **Whitespace** — jarak generous antar section (40-60px), tight di dalam group (12-16px)
- **Tipografi** — Fraunces serif besar untuk section headers, Inter untuk body
- **Divider lines** — satu garis halus horizontal, bukan box enclosure
- **Background shifts** — dark section (ink) untuk highlight moments, light section (canvas/surface) untuk data

### 8.2 Beranda — Wireframe Tekstual

```
┌─────────────────────────────────────────────┐
│ TOPBAR (tetap)                              │
├─────────────────────────────────────────────┤
│                                             │
│ ████████████████████████████████████████████ │
│ █                                         █ │
│ █  background: var(--ink)                 █ │
│ █  full-width, NO border, NO card         █ │
│ █                                         █ │
│ █  "Ahlan wa Sahlan"          [h1, huge]  █ │
│ █  السَّلَامُ عَلَيْكُمْ       [inline, gold] █ │
│ █                                         █ │
│ █  ┌─── SPOTLIGHT ──────────────────┐     █ │
│ █  │ Pemimpin Kebaikan:             │     █ │
│ █  │ BUKHARA  ████  92.4            │     █ │
│ █  │ (nama besar serif + skor)      │     █ │
│ █  └────────────────────────────────┘     █ │
│ █                                         █ │
│ █  16 Sakan · 4 Laga · 2 Agenda          █ │
│ █  [inline text indicators, NOT cards]    █ │
│ █                                         █ │
│ ████████████████████████████████████████████ │
│                                             │
│ ─── Klasemen Kebaikan ────────── Selengkapnya│
│                                             │
│  1. Bukhara ·········· 92.4               │
│  2. Naisabur ·········· 89.1               │
│  3. Qazvin ·········· 87.6               │
│  (simple ranked list, NO card wrapper)     │
│                                             │
│ ─── Laga Mendatang ─────────── Buka Turnamen│
│                                             │
│  Hamadan vs Samarkand                      │
│  Semifinal · Selasa, 16 Sep · 15:30       │
│  (single featured match, not card grid)    │
│                                             │
│ ─── Agenda Terdekat ──────────── Semua Event│
│                                             │
│  16 Sep  Kajian Akbar Akhir Pekan          │
│  18 Sep  Ujian Tahfidz Triwulan            │
│  (date-aligned list, no card wrappers)     │
│                                             │
│ ████████████████████████████████████████████ │
│ █ "Nama-Nama Bersejarah"  (footer, keep)  █ │
│ ████████████████████████████████████████████ │
└─────────────────────────────────────────────┘
```

### 8.3 Klasemen — Wireframe Tekstual

```
┌─────────────────────────────────────────────┐
│ TOPBAR                                      │
├─────────────────────────────────────────────┤
│                                             │
│ Klasemen Kebaikan     [h1, Fraunces, 28px] │
│ Tanggal: [date] [Reset]  Cari: [_______]  │
│ (toolbar TANPA card wrapper, inline di page)│
│                                             │
│ Rata-rata: Kebersihan 82 · Disiplin 79     │
│            Bahasa 84 · Total 81.7          │
│ (inline text strip, NOT 4 bordered boxes)  │
│                                             │
│ ████████████████████████████████████████████ │
│ █     PODIUM (improved, tetap dark bg)     █ │
│ █  Hapus eyebrow. Heading berdiri sendiri. █ │
│ █  Podium block lebih tinggi & kontras.    █ │
│ █  Nama + skor typography-driven.          █ │
│ ████████████████████████████████████████████ │
│                                             │
│ [Harian] [Rekap]           tabs, keep      │
│                                             │
│ Data Poin Harian          [+ Tambah] [Bulk]│
│ ─────────────────────────────────────────── │
│ #  Tanggal    Sakan    Keb  Dis  Bhs  Avg  │
│ ─────────────────────────────────────────── │
│ 1  14 Sep     Bukhara   90   88   92  90.0 │
│ 2  14 Sep     Naisabur  85   82   88  85.0 │
│    ...                                      │
│ (table TANPA ledger card wrapper)           │
│ (hapus individual row borders,             │
│  gunakan zebra striping atau spacing)      │
│                                             │
└─────────────────────────────────────────────┘
```

### 8.4 CSS Architecture Changes (Ringkasan)

```css
/* SEBELUM: Ghost card everywhere */
.toolbar { background:var(--card); border:1px solid var(--line);
           border-radius:var(--radius); box-shadow:var(--shadow); }

/* SESUDAH: Inline di page surface */
.toolbar { display:flex; gap:var(--gap-grid); align-items:center;
           padding:0 0 var(--gap-section); /* spacing saja */ }

/* SEBELUM: Ledger = card wrapping table */
.ledger { background:var(--card); border:1px solid var(--line);
          border-radius:var(--radius); padding:6px 18px 18px; }

/* SESUDAH: Table tanpa wrapper */
.ledger { padding:0; /* hapus card treatment */ }

/* SEBELUM: Stat = 4 bordered boxes */
.stat { background:var(--card); border:1px solid var(--line);
        border-radius:var(--radius); padding:16px; }

/* SESUDAH: Inline horizontal strip */
.stat-row { display:flex; gap:24px; padding:8px 0; }
.stat { display:inline-flex; align-items:baseline; gap:8px; }
.stat .n { font-size:20px; } /* smaller, inline */
.stat .l { font-size:12px; color:var(--ink-faint); }
/* no border, no background, no radius */

/* SEBELUM: Widget = card > card */
.dash-widget-box { background:var(--card); border:1px solid var(--line);
                   border-radius:var(--radius); box-shadow:var(--shadow); }

/* SESUDAH: Section dengan heading saja */
.dash-section { padding:var(--gap-section) 0;
                border-top:1px solid var(--line); }
.dash-section-head { display:flex; justify-content:space-between;
                     align-items:baseline; margin-bottom:16px; }
/* konten langsung di bawah heading, tanpa body wrapper */
```

---

## 9. ROADMAP EKSEKUSI SURGICAL & SISTEMATIS

### Fase 1: DISTILL — Bersihkan Anti-Pattern (Aman, Fungsional)

Ini bisa dikerjakan tanpa mengubah JavaScript. Hanya CSS + minor HTML reclass.

| # | Task | Effort | JS Impact |
|---|------|--------|-----------|
| 1.1 | Hapus border+shadow double declaration: pilih satu per komponen | Low | None |
| 1.2 | Hapus eyebrow: `dash-greeting-eyebrow` → inline di greeting. `.eyebrow` pada podium → delete | Low | None (JS render podium tapi tidak reference eyebrow) |
| 1.3 | Un-nest stat boxes: `stat-row` jadi inline strip tanpa border/radius/bg per `.stat` | Low | None (JS cuma set `.n` text content) |
| 1.4 | Un-card toolbar: hapus card treatment dari `.toolbar` | Low | None |
| 1.5 | Un-card ledger: hapus card treatment dari `.ledger` wrapper | Low | None (JS reference `#panelHarian` dll, bukan style) |

### Fase 2: LAYOUT — Restructure Beranda

Perubahan HTML yang lebih besar, tapi JavaScript hook-nya (`id` dan `class` references) harus dipertahankan.

| # | Task | Effort | JS Impact |
|---|------|--------|-----------|
| 2.1 | Hero: dark full-width surface + inline greeting + spotlight MVP. Pertahankan `id` untuk JS populate | Medium | `renderDashboard()` mengisi `dashStatSakan` dll — harus tetap ada elemen dengan ID ini |
| 2.2 | Metric strip: inline indicators, bukan cards. Pertahankan element IDs | Medium | JS set text content by ID — aman selama ID dipertahankan |
| 2.3 | Widget section: hapus `dash-widget-box` wrapper, konten langsung di section. Pertahankan `dashKlasemenContent`, `dashTurnamenContent`, `dashEventContent` IDs | Medium | `renderDashboard()` mengisi div by ID — aman |
| 2.4 | Konten widget (MVP card, runner-up items, match box, event items): disederhanakan dari nested card jadi flat items | Medium | JS generates HTML string — perlu update render functions |

### Fase 3: LAYOUT — Restructure Klasemen & Liga

| # | Task | Effort | JS Impact |
|---|------|--------|-----------|
| 3.1 | Klasemen: stat strip inline, podium improved, table tanpa wrapper | Medium | `renderKlasemen()` — pertahankan table `id`s dan stat element IDs |
| 3.2 | Liga: bracket tree de-boxed, champion showcase enlarged | Medium | `renderBracketTree()` — update CSS tapi pertahankan DOM structure |
| 3.3 | Event: timeline layout, hapus card wrapper per event | Low | `renderEvents()` — update render function |

### Fase 4: MODAL REDUCTION (Optional, Higher Risk)

| # | Task | Effort | JS Impact |
|---|------|--------|-----------|
| 4.1 | Input klasemen: inline expand form | High | Needs JS refactor: `openKlasemenModal()` → inline expand logic |
| 4.2 | Input massal: sub-view panel (bukan modal) | High | Needs JS refactor |
| 4.3 | Liga form: split jadwal/skor into contextual inline | High | Needs JS refactor |

> [!WARNING]
> Fase 4 membutuhkan refactor JavaScript yang signifikan. Fase 1-3 bisa memberikan 80% perbaikan visual tanpa menyentuh JS logic.

### Urutan Eksekusi yang Direkomendasikan

```
Fase 1 (1-2 jam) → Verifikasi fungsional → Fase 2 (3-4 jam) → Verifikasi → Fase 3 (2-3 jam) → Polish
```

Fase 4 dijadwalkan terpisah setelah Fase 1-3 stabil, karena menyentuh JS control flow.

---

## 10. MINOR OBSERVATIONS

- **CSS duplicate declarations:** `.btn-user-pill:hover` dan `.user-avatar-pip` didefinisikan 2x di CSS (baris 360-371 duplikat baris 355-365). Dead weight.
- **`min-width: 650px` pada table:** Paksa horizontal scroll di mobile. Gunakan responsive table pattern (card view sudah ada di rekap skor — terapkan ke semua tabel).
- **`text-transform: uppercase` pada `dash-metric-label`:** UPPERCASE labels terasa "shouty" untuk Operate mode. Sentence case lebih calm.
- **Fraunces diload tapi kurang berani:** Hanya 4 weight (400-700), optical size 9-144 yang seharusnya bisa dieksploitasi lebih. Pakai size 32-40px untuk section headers untuk *merasakan* karakter serifnya.
- **`animation: fadeIn .35s` pada setiap page panel:** Satu animasi identik di semua section — bukan "authored moment", ini template entrance. operate.md: *"No orchestrated page-load sequences."*
- **Browser surfaces tidak di-theme:** Scrollbar default, text selection default, caret default. craft-floor.md menganggap ini "cheapest signal that a page was built rather than assembled."
- **No `<dialog>` usage.** Semua modal manual div+veil. Modern browser `<dialog>` memberikan Esc handling, focus trap, dan backdrop gratis.

---

## 11. QUESTIONS TO CONSIDER

1. *Apa yang terjadi kalau kamu menghapus semua border dari halaman ini?* Konten mana yang benar-benar kehilangan struktur, dan mana yang ternyata sudah cukup jelas hanya dengan spacing dan tipografi?

2. *Kalau League of Kindness adalah sebuah buku fisik di rak perpustakaan pesantren — sampulnya seperti apa?* Jawabannya membentuk visual language yang seharusnya muncul di setiap pixel UI ini. Saat ini jawaban itu tidak terlihat sama sekali.

3. *Siapa hero-nya di halaman beranda?* Sekarang hero-nya adalah greeting text statis. Seharusnya hero-nya adalah *sakan yang memimpin*, yang datanya berubah setiap hari. Itu yang membuat orang kembali.

4. *Apa kalau podium 3-teratas — satu-satunya "authored moment" di app ini — dijadikan baseline untuk seluruh desain, alih-alih pengecualian?* Dark bg, serif besar, kontras gold: itulah karakter yang seharusnya meresap ke seluruh app.
