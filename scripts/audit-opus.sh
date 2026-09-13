#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Menjalankan Subagent Auditor: Claude Opus 4.6 (Thinking) ==="
agy --model claude-opus-4-6-thinking --print "
Kamu adalah Principal Design Director & Senior UI/UX Architect kelas dunia.
Tugasmu adalah mengaudit secara kritis dan mendalam (deep design audit) antarmuka proyek 'League of Kindness' (Asykar) yang ada di direktori ini (/home/neikami/Proyek/asykar).

File utama yang perlu kamu periksa:
1. index.html
2. css/style.css
3. js/app.js

Konteks & Keluhan Pengguna (Akami):
'kerasa kurang sih jujur.'
Desain saat ini terasa masih kurang greget, kurang berkarakter, atau terkesan hambar/kaku meskipun secara teknis aturan kontras WCAG sudah dipenuhi.

Tolong berikan audit yang jujur, tajam, tanpa basa-basi (unslop), dengan struktur:
1. ROOT CAUSE: Kenapa desain saat ini secara psikologis 'kerasa kurang'? (Identifikasi apakah ada anemia visual, ritme spasi yang terlalu monoton, kontras aksen emas yang kurang bersinar, atau hierarki font yang kurang bertenaga).
2. ATMOSFER & KARAKTER: Evaluasi perpaduan tema manuskrip klasik Islam (Forest Green #16302A, Warm Parchment #F6F1E3, Core Gold #B08A2E) vs kartu modern. Di mana letak inkonsistensi 'jiwa'-nya?
3. BREAKDOWN KOMPONEN:
   - Topbar & Brand emblem
   - Welcome Banner & Metric Cards
   - 3 Kolom Widget Beranda (Klasemen, Turnamen, Agenda)
   - Podium Klasemen (#klasemen)
   - Bagan Gugur Turnamen (#liga)
   - Modal Dialog
4. REKOMENDASI SURGICAL (KODE & STYLE):
   Berikan daftar perubahan CSS konkret (baris demi baris / blok aturan spesifik) yang bisa langsung diterapkan untuk memberikan 'punch', kedalaman fisik yang elegan, dan sentuhan visual berkelas tinggi tanpa merusak layout yang sudah ada.
"
