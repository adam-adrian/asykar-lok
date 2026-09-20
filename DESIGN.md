---
name: League of Kindness
description: Pusat Informasi Terpadu & Catatan Kehormatan Adab Santri Pesantren
colors:
  primary: "#16302A"
  primary-soft: "#26473E"
  primary-faint: "#566E65"
  canvas: "#F6F1E3"
  surface: "#FFFEFB"
  surface-float: "#FFFFFF"
  surface-subtle: "#FAF7EF"
  surface-inset: "#F2ECE0"
  line: "#DFD5B8"
  line-subtle: "#EBE3CE"
  gold: "#B08A2E"
  gold-light: "#D9B65C"
  gold-deep: "#8D6513"
  clay: "#A9503A"
  clay-light: "#C97A5E"
  green-ok: "#367052"
  ochre: "#A67324"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(22px, 3.5vw, 30px)"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  sm: "8px"
  md: "14px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-gold:
    backgroundColor: "{colors.gold-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "11px 13px"
---

# Design System: League of Kindness

## Overview

**Creative North Star: "The Living Manuscript" (Perkamen Adab Pesantren)**

League of Kindness bukan dashboard SaaS generik, bukan template admin korporat, dan bukan aplikasi konsumer kasual. Ini adalah sistem pencatatan kehormatan dan adab santri sebuah pesantren. Visualnya berakar pada kehangatan lembaran perkamen klasik, wibawa tinta hijau-gelap (*ink*), dan kilau daun emas tua (*antique leaf gold*). Setiap elemen harus memancarkan ketenangan, martabat, dan kejelasan data tanpa ornamen murahan.

Antarmuka ini beroperasi dalam mode **Operate** untuk pembina dan pengurus pesantren, sekaligus menjadi papan pengumuman kehormatan bagi seluruh santri dan wali santri. Keterbacaan, keteraturan hirarki, dan kepatutan visual jauh melampaui tren sesaat.

**Key Characteristics:**
- **Continuous Manuscript Surface**: Konten mengalir di atas kanvas perkamen yang lega, distrukturkan oleh ritme ruang dan tipografi, bukan kotak di dalam kotak (*card prison*).
- **Dignified Serif & Modern Sans**: Pasangan Fraunces (serif display penuh wibawa) dan Inter (sans-serif presisi untuk tabular dan operasional).
- **Disciplined Restraint**: Emas tua dan merah bata hadir sebagai penanda status dan penegasan aksi, bukan dekorasi liar.

---

## Colors

Palet warna bersumber dari pigmen manuskrip kitab klasik: kanvas perkamen terang, tinta hijau-gelap tua, dan aksen emas daun.

### Primary
- **Deep Forest Ink** (`#16302A`): Tinta utama untuk teks, header, tombol utama, dan bidang dark spotlight. Kontras WCAG AAA (12.5:1).
- **Forest Soft** (`#26473E`): Teks body sekunder dan label berbobot sedang.
- **Forest Faint** (`#566E65`): Teks meta, timestamp, dan garis pemisah halus (WCAG AA 4.88:1).

### Secondary & Accent
- **Antique Leaf Gold** (`#B08A2E`): Warna jangkar kehormatan pesantren. Dipakai untuk aksen trofi, border sorotan, dan fokus ring.
- **Gold Deep** (`#8D6513`): Emas pekat untuk teks di atas background terang atau tombol berlatar emas dengan teks putih (WCAG AA 4.65:1).
- **Gold Light** (`#D9B65C`): Emas terang khusus untuk teks dan ikon di atas latar gelap (`#16302A`).

### Tertiary & Semantic
- **Terracotta Seal Red** (`#A9503A`): Merah bata untuk peringatan bahaya, aksi destruktif (hapus), dan pertandingan live.
- **Sage Olive Green** (`#367052`): Hijau zaitun untuk status sukses, sinkron, dan nilai baik.
- **Manuscript Ochre** (`#A67324`): Kuning tanah untuk status antrean pending sinkronisasi lokal.

### Neutral & Surfaces
- **Parchment Canvas** (`#F6F1E3`): Level 0 — Kanvas dasar seluruh halaman.
- **Warm Manuscript Surface** (`#FFFEFB`): Level 1 — Permukaan kartu, panel ledger, dan modal.
- **Float Surface** (`#FFFFFF`): Level 2 — Kartu mengambang (match box, event card, list item).
- **Subtle Surface** (`#FAF7EF`): Level 2 Subdued — Zebra striping tabel, latar tombol sekunder, pill netral.
- **Inset Well** (`#F2ECE0`): Cekungan input dan well penampung.
- **Line Divider** (`#DFD5B8`): Garis batas struktural utama (1px).
- **Line Subtle** (`#EBE3CE`): Garis pembatas antar baris data (1px).

### Named Rules
**The Single Source Gold Rule.** Aksen emas tidak boleh diobral. Maksimal 15% dari viewport visual yang boleh memuat aksen emas. Nilai emas terletak pada kelangkaannya.
**The No-Pure-Gray Rule.** Dilarang menggunakan abu-abu dingin (`#666`, `#888`, `#ccc`). Semua nada netral wajib memiliki rona hangat (*warm olive/parchment undertone*).

---

## Typography

**Display Font:** Fraunces (Optical sizes 9–144, Serif Display)
**Body & UI Font:** Inter (Sans-Serif Geometric)

**Character:** Fraunces membawa wibawa manuskrip kitab para ulama terdahulu; Inter memberikan ketajaman, keterbacaan tabel, dan kemudahan pengisian form operasional.

### Hierarchy
- **Display Hero** (SemiBold 600, `clamp(22px, 3.5vw, 30px)`, Line-height 1.2): Salam beranda dan judul utama halaman.
- **Headline Section** (SemiBold 600, `18px–20px`, Line-height 1.25): Judul pilar, judul tabel ledger, dan heading modal.
- **Title Component** (SemiBold 600, `14px–15px`, Line-height 1.4): Nama sakan di tabel, judul agenda event, dan nama tim turnamen.
- **Body UI** (Regular 400 / Medium 500, `13px–14px`, Line-height 1.5): Teks konten, isian form, dan deskripsi event.
- **Label / Metric** (SemiBold 600 / Bold 700, `11px–12px`, Letter-spacing `0.04em`): Label indikator, pill status, dan nama sakan di podium.

### Named Rules
**The No-Eyebrow Rule.** Sesuai Impeccable Craft Floor, kicker atau eyebrow teks kecil melayang di atas heading dilarang keras. Biarkan heading berdiri sendiri dengan bobot dan ukurannya.
**The Tabular Numbers Rule.** Angka skor, persentase rata-rata, dan jam wajib menggunakan font-feature tabular (`tnum`) atau monospace proporsional agar sejajar rapi saat di-scan.

---

## Layout

- **Model Spasial**: Layout terpusat dengan lebar kontainer maksimal `1180px` di desktop, padding horizontal fluida `clamp(12px, 2.5vw, 24px)`.
- **Ritme Spasi**:
  - Jarak antar seksi besar: `20px–32px`.
  - Jarak antar komponen internal: `10px–14px`.
  - Padding kartu/kontainer: `14px–24px`.
- **Continuous Flow**: Konten mengalir sebagai kesatuan ritme halaman. Menghindari pemecahan halaman menjadi pulau-pulau kotak kecil yang terisolasi.
- **Tabel Horisontal Mobile**: Di layar sempit (`≤ 768px`), tabel yang membutuhkan scroll horisontal wajib diisolasi di dalam `.ledger-table-wrap` sehingga judul seksi, tombol aksi, dan kontrol filter tetap terkunci di tempat.

---

## Elevation & Depth

League of Kindness menganut filosofi **Flat-at-Rest with Tonal Separation**. Depth diciptakan oleh pergeseran rona permukaan (`canvas` → `surface` → `surface-float`), bukan tumpukan bayangan tebal.

### Shadow Vocabulary
- **Card Ambient** (`0 2px 8px rgba(22,48,42,.04)`): Bayangan sangat lembut untuk kartu mandiri di atas kanvas perkamen.
- **Modal Depth** (`0 16px 36px -6px rgba(22,48,42,.22)`): Bayangan fokus untuk dialog modal dan popup profil.
- **Button Lift** (`0 4px 14px rgba(0,0,0,.2)`): Efek hover tombol utama saat diangkat.

### Named Rules
**The Single Declaration Rule.** Elemen hanya boleh mendeklarasikan elevasi SATU KALI: border halus ATAU bayangan lembut. Dilarang menggabungkan border 1px kontras tinggi dengan bayangan lebar (*the ghost card*).
**The No-Border-Left Accent Rule.** Dilarang membuat aksen garis tebal di sebelah kiri kartu (`border-left: 4px solid ...`) sebagai penanda status. Gunakan pill atau badge tersendiri.

---

## Shapes

Sistem kelengkungan sudut menggunakan **3-Tier Radius Scale** yang konsisten dan terukur:

1. **Small Radius (`--radius-sm: 8px`)**:
   - Wajib untuk SEMUA input form (`input[type=text]`, `input[type=password]`, `input[type=date]`, `input[type=number]`, `select`, `textarea`, `.search-field input`).
   - Icon button (`.icon-btn`), date box mini, thumbnail gambar, dan chip internal.
2. **Medium Radius (`--radius: 14px`)**:
   - Kontainer seksi, hero banner, podium wrapper, dan kartu jadwal turnamen.
3. **Pill Radius (`999px`)**:
   - Tombol utama (`.btn`), badge status, tab pill navigasi, dan avatar.

### Named Rules
**The Textbox Conformity Rule.** Kotak input/textbox tidak boleh memiliki radius liar atau sudut siku 0px bawaan browser. Semua field input wajib tunduk pada token `--radius-sm (8px)`.
**The Card Radius Boundary Rule.** Kontainer luar maksimal 14–18px. Radius melebihi 24px dilarang kecuali untuk elemen kapsul penuh (*pill*).

---

## Components

### Buttons
- **Primary (`.btn-primary`)**: Latar `--ink`, teks `--text-inverse`, bentuk kapsul pill (`999px`), padding `10px 20px`.
- **Gold Accent (`.btn-gold`)**: Latar `--gold-deep`, teks putih, bentuk kapsul pill.
- **Ghost / Outline (`.btn-ghost`)**: Latar transparan, border 1px `--line`, teks `--ink`.
- **Secondary (`.btn-secondary`)**: Latar `--surface-subtle`, border 1px `--line`, teks `--ink-soft`.
- **Touch Target**: Minimal tinggi `34px` di mobile untuk tombol aksi baris.

### Form Inputs & Textboxes
- **Style Standar**: Latar `--card` / `--surface`, border 1px solid `--line`, radius `--radius-sm (8px)`, font Inter `14px`, warna teks `--ink`.
- **Cakupan Universal**: Aturan ini berlaku mutlak untuk:
  - Input di dalam modal form (`.field input`, `.field select`, `.field textarea`).
  - Input pencarian toolbar (`.search-field input`).
  - Input filter tanggal (`.toolbar input[type=date]`).
  - Input tabel massal (`.bulk-input-table input[type=number]`).
- **Focus Ring**: `border-color: var(--gold); box-shadow: 0 0 0 3px rgba(176,138,46,.15); outline: none`.
- **Invalid State**: Border `--clay`, latar `--clay-subtle`.

### Icons
- **System**: Seluruh ikon wajib berasal dari pustaka vektor SVG terkontrol melalui helper `svgIcon(name, size)`.
- **Stroke & Weight**: Stroke tunggal berbobot 2px, `stroke-linecap: round`, `stroke-linejoin: round`.

### Modals & Dialogs
- **Desktop & Tablet**: Dialog mengambang terpusat (*centered modal dialog*), latar `--card`, radius 18–20px, bayangan terpusat dengan backdrop blur lembut (`rgba(22,48,42,.65)`).
- **Mobile**: Tetap mempertahankan integritas struktur dialog. Dialog form pendek tidak boleh didistorsi paksa sehingga memotong keyboard atau merusak aksesibilitas input.

---

## Do's and Don'ts

### Do:
- **Do** gunakan `svgIcon(name)` untuk seluruh indikator grafis.
- **Do** pastikan seluruh textbox dan field pencarian memakai token radius `--radius-sm: 8px` dan border `--line`.
- **Do** pertahankan kontras rasio minimal 4.5:1 untuk teks biasa dan 3:1 untuk teks besar sesuai standar WCAG AA.
- **Do** periksa tampilan dalam kondisi data terisi maupun data awal kosong (*cold-start*).
- **Do** uji responsivitas form terhadap keyboard virtual di perangkat seluler.

### Don't:
- **Don't** pernah menggunakan raw Unicode emoji (🏆, ⚽, 📅, ⭐, ⚠️) sebagai icon system. Gunakan SVG vector icons yang selaras.
- **Don't** membuat *nested card prison* (kotak berborder di dalam kotak berborder di dalam kotak berborder).
- **Don't** menggunakan eyebrow / kicker di atas heading.
- **Don't** mengubah modal menjadi bottom-sheet secara serampangan tanpa memperhitungkan form layout dan input flow.
- **Don't** membuat textbox kotak dengan sudut tajam default browser yang tidak sinkron dengan design tokens.
- **Don't** melakukan tebak-tebakan visual dari bobot model AI sendiri tanpa memeriksa token dan aturan Impeccable.
