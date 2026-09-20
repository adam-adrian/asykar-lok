# Klasemen: Tulis Per-Field, Tabel Sakan, dan Serialisasi Mutasi

Tanggal: 2026-09-03
Status: menunggu review
Branch: `feat/klasemen-per-field` (dibuat saat implementasi mulai)

## Masalah

Modul Klasemen menulis seluruh baris pada setiap simpan. Karena tiga kategori
penilaian (kebersihan, kedisiplinan, bahasa) dapat diisi terpisah — mungkin oleh
juri berbeda pada waktu berbeda — satu baris adalah unit tulis yang terlalu
besar. Konsekuensinya, terverifikasi dengan menjalankan `Code.gs` di atas stub
Apps Script:

**Lost update.** Juri A menyimpan 90/85/80. Juri B kemudian menyimpan hanya
nilai bahasa 70. Hasil di sheet: `["", "", 70]` — nilai juri A hilang. Terjadi
tanpa kegagalan jaringan dan tanpa akses bersamaan; cukup dua kali simpan
berurutan. Penyebabnya `simpanKlasemen` mengirim ketiga field selalu, dan
`Code.gs:211-214` menulis keempat sel tanpa memeriksa apakah field disebut.

**Kosong tidak bisa dibedakan dari nol.** `rd()` (`index.html:1093`)
mengembalikan `null` untuk input kosong, lalu server menyimpan `""`. Tidak ada
cara membedakan "belum dinilai" dari "dinilai nol".

**Agregasi menghitung kosong sebagai nol.** Delapan titik
(`index.html:956-958`, `979-981`, `1007-1008`) memakai `Number(x) || 0` dan
membagi dengan 3. Sakan yang baru dinilai kebersihan 90 tampil `Avg: 30` di
podium — terlihat buruk, bukan terlihat belum lengkap. Tabel harian sudah benar
(`index.html:1021-1022` membagi dengan `validCount`), jadi ini inkonsistensi
antar-agregasi, bukan cacat konsep.

**Penjaga yang tidak berfungsi.** `if(nk!==undefined)` (`index.html:1103-1105`)
tidak pernah salah karena `rd()` tidak pernah mengembalikan `undefined`. Niat
"hanya perbarui yang diisi" sudah ada di kode, tapi tidak tercapai.

**Race condition.** Terverifikasi dengan menyuntik interleaving ke `Code.gs`:

- Dua `save_klasemen` untuk kunci sama yang memindai sheet sebelum baris ada:
  keduanya `appendRow`, menghasilkan **dua baris duplikat**. `findKlasemenRecord`
  hanya menemukan yang pertama, jadi nilai di baris kedua tampak hilang.
- `deleteRowById` memindai lalu `deleteRow(i+1)`. Jika penghapusan lain mendarat
  di antaranya, indeks bergeser dan **baris yang salah terhapus**. Diminta hapus
  C dari `A,B,C,D`, hasilnya `B,C` — C selamat, D lenyap.

Race ini sudah ada di kode yang berjalan sekarang; bukan akibat perubahan ini.

**Daftar sakan hardcoded dua kali.** `SAKAN_LIST` (`index.html:617-622`) dan 19
pill homepage (`index.html:367-385`) — isi dan urutan identik, terverifikasi.
Menambah sakan berarti mengedit dua tempat lalu deploy.

**Nama sakan dipakai sebagai kunci.** Tiga belas titik di `index.html` plus
`Code.gs:202,233` menunjuk sakan lewat namanya. Mengubah nama memutus seluruh
riwayat klasemen dan liga sakan tersebut.

## Keputusan desain

### Skema

```
Sakan:    id | nama | urutan | aktif
Klasemen: id | tanggal | sakanId | kebersihan | kedisiplinan | bahasa | rataPoin
Liga:     id | round | tanggal | timA | timB | skorA | skorB    (timA/timB → sakanId)
Event:    tidak berubah
```

Bentuk lebar dipertahankan — satu baris memuat ketiga kategori. Bentuk panjang
(satu baris per penilaian) sudah dipertimbangkan dan ditolak: ia menyentuh 63
titik, melipatgandakan jumlah baris, dan menghilangkan tampilan matriks yang
memudahkan pengurus membaca sheet secara manual. Masalah sebenarnya bukan bentuk
tabel, melainkan granularitas tulis.

`Sakan.id` berupa slug dari nama awal (`qazvin-atas`, `hamadan-lorong`). Slug
dipilih di atas kode ringkas (`QZA`) atau angka agar sheet `Klasemen` tetap
terbaca manusia. Slug dibuat sekali dan tidak pernah berubah meski nama diganti.

`rataPoin` menggantikan `totalPoin`; isinya rata-rata kategori yang terisi,
sesuai yang ditampilkan UI. `totalPoin` sekarang berisi jumlah sementara UI
menampilkan rata-rata — pengguna sheet melihat angka berbeda dari pengguna
aplikasi.

`aktif=false` menyembunyikan sakan dari dropdown tanpa menghapus barisnya,
sehingga riwayatnya tetap dapat dibaca. `urutan` menjaga susunan pill homepage
yang bermakna (Qazvin, Naisabur, Sijistan, Hamadan, lalu nama non-kota), bukan
alfabetis.

### Tulis per-field

Modal menyimpan snapshot nilai saat dibuka. Saat simpan, tiap kategori
dibandingkan dengan snapshot:

| Input | Snapshot | Dikirim | Arti |
|---|---|---|---|
| `85` | `90` | `85` | ubah nilai |
| `90` | `90` | tidak dikirim | tidak berubah |
| kosong | `90` | `null` | kosongkan |
| kosong | kosong | tidak dikirim | tidak disentuh |

Tombol clear per field adalah affordance di atas mekanisme yang sama: ia
mengosongkan input, dan diff menyimpulkan `null`. Dua makna yang tegas —
`undefined` berarti jangan sentuh, `null` berarti kosongkan.

Sisi server:

```js
const KLASEMEN_COLS = { kebersihan: 4, kedisiplinan: 5, bahasa: 6 };

Object.keys(KLASEMEN_COLS).forEach(k => {
  if (!(k in payload)) return;
  sheet.getRange(rowIndex, KLASEMEN_COLS[k])
       .setValue(payload[k] === null ? "" : payload[k]);
});
```

Satu fungsi dengan tabel kolom, bukan tiga fungsi per kategori — tiga fungsi
akan mengulang pencarian baris dan pembuatan sheet. Menambah kategori keempat
kelak berarti satu entri di `KLASEMEN_COLS`.

`rataPoin` dihitung ulang dari isi baris setelah penulisan, karena payload
per-field tidak mengetahui nilai kategori lain.

Server menolak `sakanId` yang tidak ada di tab `Sakan`.

### Serialisasi mutasi

Seluruh blok mutasi `doPost` dibungkus `LockService.getScriptLock()`:

```js
const lock = LockService.getScriptLock();
if (!lock.tryLock(20000)) return jsonOut({ status: "error", message: "Server sibuk, coba lagi." });
try { /* mutasi */ } finally { lock.releaseLock(); }
```

Ini menutup ketiga race: baris duplikat, hapus baris salah, dan pembacaan usang
saat menghitung `rataPoin`. Pada volume proyek ini (belasan tulis per hari)
biaya serialisasi nol dalam praktik, dan tidak diperlukan strategi retry atau
versioning.

`doGet` sengaja tidak dikunci — baca yang sedikit usang tidak berbahaya, dan
lock pada baca membuat pembaca saling menunggu.

### Idempotensi

`save_match` (`Code.gs:251`) dan `save_event` (`Code.gs:281`) selalu
`appendRow`. Push ulang dengan `id` sama menghasilkan dua baris — terverifikasi.
Keduanya diubah menjadi upsert berdasarkan `id`, yang klien sudah kirimkan.
Efek sampingnya: match dan event akhirnya punya jalur edit; sekarang koreksi
hanya bisa lewat hapus lalu tambah ulang.

`save_klasemen` sudah idempoten (upsert berdasarkan `tanggal`+`sakanId`).
`delete_*` idempoten secara alami.

### Agregasi

Satu helper `avgTerisi(record)` dipakai di empat tempat: render baris (sudah
benar), pengurutan (`index.html:1007-1008`), kartu statistik (`979-981`), dan
rekap (`956-958`). Untuk rekap, setiap kategori memerlukan pembagi sendiri —
satu sakan bisa memiliki lima nilai kebersihan tetapi dua nilai bahasa.

### Tabel Sakan dikelola dari sheet

Konsisten dengan tab `Users`: tidak ada `save_sakan`, tidak ada modal. Tab
`Sakan` hanya ikut di `doGet`. Trigger `onEdit` mengisi `id` otomatis saat
pengurus menambah nama dengan kolom id kosong; tanpa itu janji "tambah sakan
tanpa ubah kode" tidak berlaku.

Pill homepage dirender dari tabel yang sama. Membiarkannya statis akan
mempertahankan duplikasi yang menjadi alasan perubahan ini.

Daftar sakan kini melalui `doGet`, sehingga dropdown baru terisi setelah sync.
Fallback: cache `localStorage`; bila kosong juga, tampilkan pesan tegas alih-alih
dropdown hampa.

### Penjaga klik ganda

`hapusKlasemen` (`index.html:1124`), `hapusMatch` (`1279`), dan `hapusEvent`
(`1460`) tidak memiliki penjaga; klik ganda mengirim dua permintaan hapus.
Lock server membuatnya aman berurutan, tetapi penjaga klien tetap ditambahkan.

`syncDataFromCloud` dapat berjalan bersamaan dengan dirinya sendiri — dipanggil
dari badge (`index.html:409`), `init` (`1500`), dan setelah simpan event
(`1454`). Respons yang datang tidak berurutan dapat membuat data lebih tua
menang. Ditambahkan flag "sedang sync" yang mengabaikan panggilan kedua.

## Migrasi

Fungsi `migrateSakanIds()` dijalankan sekali dari editor Apps Script:

1. Seed tab `Sakan` dari 19 nama yang ada, `urutan` mengikuti urutan sekarang,
   `aktif=true`, `id` berupa slug.
2. Tulis ulang kolom `sakan` → `sakanId` di `Klasemen`.
3. Tulis ulang `timA`/`timB` di `Liga` dari nama ke id.
4. Ganti header `totalPoin` → `rataPoin` dan hitung ulang nilainya.

Aplikasi masih dalam pengembangan, sehingga mengosongkan sheet juga sah.
Konverter tetap disediakan karena lebih aman dan hanya belasan baris.

## Di luar cakupan

Tetap terbuka dari review sebelumnya, sengaja tidak disentuh:

- `foto` belum di-escape (`index.html:1321`) — XSS tersimpan lewat akses edit sheet
- CORS wildcard (`api/sync.js:3-6`)
- Jalur `local:true` melaporkan sukses palsu (`api/sync.js:23-29`)
- Hash password — diputuskan nice-to-have, ditunda
- Rotasi password `asykar` di sheet (masih terbaca di riwayat git repo publik)
- Teks peran `applyAccessNotes` (`index.html:916`) menyebut juri sebagai tamu

Dua bug indikator sync sudah terverifikasi tetapi belum diperbaiki: badge
tertinggal di "Sinkronisasi..." saat server membalas JSON error
(`index.html:726` tanpa `else`), dan badge menyatakan "Cloud Terhubung" saat
tulis ditolak (`index.html:768`).

## Verifikasi

Apps Script tidak memiliki runtime lokal, sehingga `Code.gs` diuji di atas stub
`SpreadsheetApp`/`CacheService`/`LockService`/`Utilities`, dan skrip `index.html`
di atas DOM tiruan. Yang harus dibuktikan:

1. Juri A isi tiga field, juri B isi bahasa saja → nilai A utuh
2. Tombol clear → sel benar-benar kosong, kategori lain tidak tersentuh
3. Field tak berubah tidak terkirim (payload hanya memuat yang berubah)
4. `rataPoin` = rata-rata kategori terisi, bukan dibagi 3
5. Podium/statistik/pengurutan mengabaikan kategori kosong
6. Dua `save_klasemen` bersamaan untuk kunci sama → satu baris, kedua nilai utuh
7. `delete_match` bersamaan → baris yang benar terhapus
8. `save_event`/`save_match` dikirim dua kali dengan id sama → satu baris
9. `sakanId` tidak dikenal → ditolak
10. Dropdown kosong saat sync gagal → pesan, bukan senyap
11. `onEdit` mengisi slug untuk baris sakan baru
12. `migrateSakanIds()` idempoten — dijalankan dua kali tidak merusak data
