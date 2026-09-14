/**
 * standings-engine.js - In-Process Pure Calculation Module
 * Bertanggung jawab atas seluruh komputasi penilaian, agregasi per-field,
 * perankingan klasemen, dan geometri slot podium visual.
 * 
 * Sifat: In-Process murni, zero I/O, zero side-effects.
 */

(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    global.StandingsEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ERROR_CODES = {
    INVALID_DATE: 'ERR_INVALID_DATE',
    MISSING_SAKAN: 'ERR_MISSING_SAKAN',
    NOT_A_NUMBER: 'ERR_NOT_A_NUMBER',
    OUT_OF_RANGE: 'ERR_OUT_OF_RANGE',
    EMPTY_DATA: 'ERR_EMPTY_DATA'
  };

  /**
   * Sanitasi & validasi input poin per kategori (0 - 100).
   * Menerima angka, string angka bulat murni, atau null/empty.
   */
  function sanitizeScoreInput(val, min = 0, max = 100) {
    if (val === null || val === undefined || val === '') {
      return { ok: true, value: null };
    }
    const str = String(val).trim();
    if (!/^-?\d+$/.test(str)) {
      return {
        ok: false,
        code: ERROR_CODES.NOT_A_NUMBER,
        message: 'Nilai harus berupa angka bilangan bulat murni (tanpa huruf/desimal).'
      };
    }
    const n = parseInt(str, 10);
    if (n < min || n > max) {
      return {
        ok: false,
        code: ERROR_CODES.OUT_OF_RANGE,
        message: `Nilai poin harus di antara ${min} sampai ${max}.`
      };
    }
    return { ok: true, value: n };
  }

  /**
   * Validasi satu baris entri penilaian klasemen harian.
   */
  function validateEntry(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return {
        ok: false,
        code: ERROR_CODES.EMPTY_DATA,
        message: 'Data isian penilaian tidak boleh kosong.',
        field: null
      };
    }

    const { tanggal, sakan, kebersihan, kedisiplinan, bahasa } = candidate;

    // 1. Validasi Tanggal (YYYY-MM-DD sah)
    const t = String(tanggal || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return {
        ok: false,
        code: ERROR_CODES.INVALID_DATE,
        message: 'Format tanggal tidak valid (harus YYYY-MM-DD).',
        field: 'tanggal'
      };
    }
    const parsedDate = new Date(t + 'T00:00:00Z');
    if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== t) {
      return {
        ok: false,
        code: ERROR_CODES.INVALID_DATE,
        message: 'Tanggal yang dimasukkan bukan kalender yang sah.',
        field: 'tanggal'
      };
    }

    // 2. Validasi Sakan
    const s = String(sakan || '').trim();
    if (!s) {
      return {
        ok: false,
        code: ERROR_CODES.MISSING_SAKAN,
        message: 'Nama sakan wajib dipilih.',
        field: 'sakan'
      };
    }

    // 3. Sanitasi Poin Kategori (Maksimal 100)
    const resKeb = sanitizeScoreInput(kebersihan, 0, 100);
    if (!resKeb.ok) {
      return { ok: false, code: resKeb.code, message: `Kebersihan: ${resKeb.message}`, field: 'kebersihan' };
    }

    const resKed = sanitizeScoreInput(kedisiplinan, 0, 100);
    if (!resKed.ok) {
      return { ok: false, code: resKed.code, message: `Kedisiplinan: ${resKed.message}`, field: 'kedisiplinan' };
    }

    const resBah = sanitizeScoreInput(bahasa, 0, 100);
    if (!resBah.ok) {
      return { ok: false, code: resBah.code, message: `Bahasa: ${resBah.message}`, field: 'bahasa' };
    }

    const hasAny = resKeb.value !== null || resKed.value !== null || resBah.value !== null;
    if (!hasAny) {
      return {
        ok: false,
        code: ERROR_CODES.EMPTY_DATA,
        message: 'Minimal salah satu kategori nilai (kebersihan, kedisiplinan, bahasa) harus diisi.',
        field: 'kebersihan'
      };
    }

    return {
      ok: true,
      value: {
        tanggal: t,
        sakan: s,
        kebersihan: resKeb.value,
        kedisiplinan: resKed.value,
        bahasa: resBah.value
      }
    };
  }

  /**
   * Validasi sekumpulan entri penilaian (untuk Input Massal Harian).
   * Mengabaikan sakan yang sama sekali tidak diisi (semua kategori kosong).
   */
  function validateBulk(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return {
        ok: false,
        code: ERROR_CODES.EMPTY_DATA,
        message: 'Daftar penilaian massal kosong.',
        validEntries: [],
        errors: []
      };
    }

    const validEntries = [];
    const errors = [];

    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      // Jika semua kolom poin kosong/null, lewati baris ini tanpa error
      const rawKeb = item.kebersihan, rawKed = item.kedisiplinan, rawBah = item.bahasa;
      const isBlank = (rawKeb === '' || rawKeb == null) &&
                      (rawKed === '' || rawKed == null) &&
                      (rawBah === '' || rawBah == null);
      if (isBlank) continue;

      const res = validateEntry(item);
      if (!res.ok) {
        errors.push({
          index: i,
          sakan: item.sakan || `Baris ${i + 1}`,
          field: res.field,
          code: res.code,
          message: res.message
        });
      } else {
        validEntries.push(res.value);
      }
    }

    if (errors.length > 0) {
      return {
        ok: false,
        code: errors[0].code,
        message: `${errors[0].sakan} - ${errors[0].message}`,
        validEntries,
        errors
      };
    }

    if (validEntries.length === 0) {
      return {
        ok: false,
        code: ERROR_CODES.EMPTY_DATA,
        message: 'Tidak ada nilai sakan yang diisi untuk disimpan.',
        validEntries: [],
        errors: []
      };
    }

    return {
      ok: true,
      validEntries,
      errors: []
    };
  }

  /**
   * Normalisasi nilai skor: angka 0-100 atau null (belum dinilai).
   */
  function parseScore(val) {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  }

  /**
   * Menghitung klasemen harian berdasarkan tanggal & query pencarian.
   * Menggunakan aturan per-field: pembagi rata-rata (validCount) hanya menghitung kategori terisi.
   */
  function computeDailyStandings(records, filter = {}) {
    if (!Array.isArray(records) || records.length === 0) return [];

    const dateFilter = filter.tanggal || filter.date || '';
    const queryFilter = (filter.query || filter.q || '').trim().toLowerCase();

    // 1. Filter tanggal dan query sakan
    let rows = dateFilter ? records.filter(r => r.tanggal === dateFilter) : [...records];
    if (queryFilter) {
      rows = rows.filter(r => String(r.sakan || '').toLowerCase().includes(queryFilter));
    }

    // 2. Evaluasi skor per baris
    const evaluated = rows.map(r => {
      const keb = parseScore(r.kebersihan);
      const ked = parseScore(r.kedisiplinan);
      const bah = parseScore(r.bahasa);

      const validValues = [keb, ked, bah].filter(v => v !== null);
      const validCount = validValues.length;
      const rowSum = validValues.reduce((sum, v) => sum + v, 0);
      const rowAvg = validCount > 0 ? Number((rowSum / validCount).toFixed(1)) : null;

      return {
        id: r.id || `${r.tanggal}_${r.sakan}`,
        tanggal: r.tanggal,
        sakan: r.sakan,
        kebersihan: keb,
        kedisiplinan: ked,
        bahasa: bah,
        validCount,
        rowAvg,
        _syncStatus: r._syncStatus || null,
        _syncId: r._syncId || null,
        _syncError: r._syncError || null
      };
    });

    // 3. Sorting stabil berdasarkan rata-rata baris tertinggi
    evaluated.sort((a, b) => {
      const scoreA = a.rowAvg !== null ? a.rowAvg : -1;
      const scoreB = b.rowAvg !== null ? b.rowAvg : -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return String(a.sakan).localeCompare(String(b.sakan));
    });

    // 4. Tetapkan peringkat (standar kompetisi tied ranking: 1, 2, 2, 4)
    let currentDailyRank = 1;
    return evaluated.map((row, idx) => {
      if (idx > 0) {
        const prev = evaluated[idx - 1];
        if (row.rowAvg !== prev.rowAvg) {
          currentDailyRank = idx + 1;
        }
      }
      return {
        ...row,
        rank: currentDailyRank
      };
    });
  }

  /**
   * Menghitung rekap performa kumulatif seluruh sakan sepanjang musim.
   * Masing-masing aspek dihitung rata-ratanya sendiri sebelum dikombinasikan.
   */
  function computeSummary(records, filter = {}) {
    if (!Array.isArray(records) || records.length === 0) return [];

    const queryFilter = (filter.query || filter.q || '').trim().toLowerCase();
    const map = {};

    records.forEach(r => {
      const sakanRaw = String(r.sakan || '').trim();
      if (!sakanRaw) return;
      const sakanKey = sakanRaw.toUpperCase();

      if (!map[sakanKey]) {
        map[sakanKey] = {
          sakan: sakanKey,
          jumlah: 0,
          sumKeb: 0, countKeb: 0,
          sumKed: 0, countKed: 0,
          sumBah: 0, countBah: 0
        };
      }

      const item = map[sakanKey];
      const keb = parseScore(r.kebersihan);
      const ked = parseScore(r.kedisiplinan);
      const bah = parseScore(r.bahasa);

      // Hitung baris jika minimal satu kategori dinilai
      if (keb !== null || ked !== null || bah !== null) {
        item.jumlah++;
      }

      if (keb !== null) { item.sumKeb += keb; item.countKeb++; }
      if (ked !== null) { item.sumKed += ked; item.countKed++; }
      if (bah !== null) { item.sumBah += bah; item.countBah++; }

      if (r._syncStatus === 'pending' || r._syncStatus === 'failed') {
        item._syncStatus = r._syncStatus;
        item._syncId = r._syncId;
        item._syncError = r._syncError;
      }
    });

    let list = Object.values(map).map(item => {
      const avgKeb = item.countKeb ? item.sumKeb / item.countKeb : 0;
      const avgKed = item.countKed ? item.sumKed / item.countKed : 0;
      const avgBah = item.countBah ? item.sumBah / item.countBah : 0;

      // Kategori yang memiliki data dijadikan pembagi
      const activeAspects = [item.countKeb, item.countKed, item.countBah].filter(c => c > 0).length;
      const combined = activeAspects > 0 ? (avgKeb + avgKed + avgBah) / activeAspects : 0;

      return {
        sakan: item.sakan,
        jumlah: item.jumlah,
        avgKeb: avgKeb.toFixed(1),
        avgKed: avgKed.toFixed(1),
        avgBah: avgBah.toFixed(1),
        avgCombined: Number(combined.toFixed(1)),
        _syncStatus: item._syncStatus || null,
        _syncId: item._syncId || null,
        _syncError: item._syncError || null
      };
    });

    if (queryFilter) {
      list = list.filter(item => item.sakan.toLowerCase().includes(queryFilter));
    }

    list.sort((a, b) => {
      if (b.avgCombined !== a.avgCombined) return b.avgCombined - a.avgCombined;
      return a.sakan.localeCompare(b.sakan);
    });

    let currentSummaryRank = 1;
    return list.map((item, idx) => {
      if (idx > 0) {
        const prev = list[idx - 1];
        if (item.avgCombined !== prev.avgCombined) {
          currentSummaryRank = idx + 1;
        }
      }
      return {
        ...item,
        rank: currentSummaryRank
      };
    });
  }

  /**
   * Mengambil 3 sakan teratas dan menatanya ke dalam geometri visual podium [Juara 2, Juara 1, Juara 3].
   */
  function extractPodium(summaries) {
    if (!Array.isArray(summaries) || summaries.length === 0) {
      return { hasData: false, slots: [] };
    }

    const validList = summaries.filter(s => s.jumlah > 0);
    if (validList.length === 0) {
      return { hasData: false, slots: [] };
    }

    const top3 = validList.slice(0, 3);
    let podiumOrder = [];
    let ranks = [];
    let cssClasses = [];

    if (top3.length === 1) {
      podiumOrder = [top3[0]];
      ranks = [1];
      cssClasses = ['p1'];
    } else if (top3.length === 2) {
      podiumOrder = [top3[1], top3[0]];
      ranks = [2, 1];
      cssClasses = ['p2', 'p1'];
    } else {
      podiumOrder = [top3[1], top3[0], top3[2]];
      ranks = [2, 1, 3];
      cssClasses = ['p2', 'p1', 'p3'];
    }

    const slots = podiumOrder.map((item, i) => ({
      sakan: item.sakan,
      score: item.avgCombined,
      rank: ranks[i],
      cssClass: cssClasses[i]
    }));

    return {
      hasData: true,
      topSakan: top3[0],
      slots
    };
  }

  /**
   * Menghitung rata-rata global di subset baris yang sedang ditampilkan.
   */
  function computeMetrics(records, filter = {}) {
    const dailyRows = computeDailyStandings(records, filter);
    const count = dailyRows.length;

    if (count === 0) {
      return {
        count: 0,
        avgKeb: "0.0",
        avgKed: "0.0",
        avgBah: "0.0",
        avgCombined: "0.0"
      };
    }

    let sumKeb = 0, countKeb = 0;
    let sumKed = 0, countKed = 0;
    let sumBah = 0, countBah = 0;

    dailyRows.forEach(row => {
      if (row.kebersihan !== null) { sumKeb += row.kebersihan; countKeb++; }
      if (row.kedisiplinan !== null) { sumKed += row.kedisiplinan; countKed++; }
      if (row.bahasa !== null) { sumBah += row.bahasa; countBah++; }
    });

    const gAvgKeb = countKeb ? (sumKeb / countKeb) : 0;
    const gAvgKed = countKed ? (sumKed / countKed) : 0;
    const gAvgBah = countBah ? (sumBah / countBah) : 0;

    const activeAspects = [countKeb, countKed, countBah].filter(c => c > 0).length;
    const gAvgCombined = activeAspects ? (gAvgKeb + gAvgKed + gAvgBah) / activeAspects : 0;

    return {
      count,
      avgKeb: gAvgKeb.toFixed(1),
      avgKed: gAvgKed.toFixed(1),
      avgBah: gAvgBah.toFixed(1),
      avgCombined: gAvgCombined.toFixed(1)
    };
  }

  return {
    ERROR_CODES,
    sanitizeScoreInput,
    validateEntry,
    validateBulk,
    computeDailyStandings,
    computeSummary,
    extractPodium,
    computeMetrics
  };
});
