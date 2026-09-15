/**
 * tournament-engine.js - In-Process Pure Calculation Module
 * Bertanggung jawab atas seluruh aturan sistem gugur (knockout), pohon bagan
 * turnamen (bracket tree), validasi anti-seri, dan penentuan juara liga bola.
 * 
 * Sifat: In-Process murni, zero I/O, zero side-effects.
 */

const TournamentEngine = (function () {
  'use strict';

  /**
   * Memisahkan daftar pertandingan menjadi Jadwal (Akan Datang) vs Hasil (Selesai),
   * serta mendeteksi laga yang sedang berlangsung (LIVE).
   */
  function partitionMatches(matches) {
    if (!Array.isArray(matches) || matches.length === 0) {
      return {
        jadwalList: [],
        hasilList: [],
        liveMatch: null
      };
    }

    const jadwalList = [];
    const hasilList = [];
    let liveMatch = null;

    matches.forEach(m => {
      if (!m) return;
      const hasSkor = m.skorA !== "" && m.skorA != null && m.skorB !== "" && m.skorB != null;
      const isComplete = m.status === "SELESAI" || hasSkor;

      if (m.status === "LIVE") {
        liveMatch = m;
      }

      if (isComplete) {
        hasilList.push(m);
      } else {
        jadwalList.push(m);
      }
    });

    // Urutkan jadwal: tanggal & waktu terdekat di atas (ascending)
    jadwalList.sort((a, b) => {
      const keyA = String(a.tanggal || '') + String(a.waktu || '');
      const keyB = String(b.tanggal || '') + String(b.waktu || '');
      return keyA.localeCompare(keyB);
    });

    // Urutkan hasil: tanggal terbaru di atas (descending)
    hasilList.sort((a, b) => {
      return String(b.tanggal || '').localeCompare(String(a.tanggal || ''));
    });

    return {
      jadwalList,
      hasilList,
      liveMatch
    };
  }

  /**
   * Menyusun pohon bagan turnamen sistem gugur (Penyisihan, Semifinal, Grand Final),
   * mengevaluasi pemenang tiap partai, dan menentukan status Juara Utama.
   */
  function buildBracket(matches) {
    const { hasilList } = partitionMatches(matches);

    function evaluateMatch(m) {
      const sa = (m.skorA !== "" && m.skorA != null) ? Number(m.skorA) : null;
      const sb = (m.skorB !== "" && m.skorB != null) ? Number(m.skorB) : null;
      const isComplete = sa !== null && sb !== null;
      const isDraw = isComplete && sa === sb;
      const isAWin = isComplete && sa > sb;
      const isBWin = isComplete && sb > sa;
      const winner = isAWin ? m.timA : (isBWin ? m.timB : null);
      const loser = isAWin ? m.timB : (isBWin ? m.timA : null);

      return {
        ...m,
        skorA: sa,
        skorB: sb,
        isComplete,
        isDraw,
        isAWin,
        isBWin,
        winner,
        loser
      };
    }

    const penyisihan = hasilList
      .filter(m => m.round === "Penyisihan")
      .map(evaluateMatch);

    const semifinal = hasilList
      .filter(m => m.round === "Semifinal")
      .map(evaluateMatch);

    const finalMatches = hasilList
      .filter(m => m.round === "Final")
      .map(evaluateMatch);

    // Evaluasi Grand Final & Champion
    const finalMatch = finalMatches.length > 0 ? finalMatches[0] : null;
    const isFinalDone = Boolean(finalMatch && finalMatch.isComplete && !finalMatch.isDraw);
    const champion = isFinalDone ? finalMatch.winner : null;
    const runnerUp = isFinalDone ? finalMatch.loser : null;

    return {
      rounds: {
        penyisihan,
        semifinal,
        final: finalMatches
      },
      champion,
      runnerUp,
      isDecided: isFinalDone
    };
  }

  const ERROR_CODES = {
    MATCH_NOT_FOUND: 'ERR_MATCH_NOT_FOUND',
    EMPTY_SCORE: 'ERR_EMPTY_SCORE',
    NOT_A_NUMBER: 'ERR_NOT_A_NUMBER',
    OUT_OF_RANGE: 'ERR_OUT_OF_RANGE',
    ANTI_DRAW: 'ERR_ANTI_DRAW',
    MISSING_TEAM: 'ERR_MISSING_TEAM',
    DUPLICATE_TEAM: 'ERR_DUPLICATE_TEAM',
    INVALID_DATE: 'ERR_INVALID_DATE',
    EMPTY_SCHEDULE: 'ERR_EMPTY_SCHEDULE'
  };

  /**
   * Memvalidasi input skor pertandingan sistem gugur.
   * Invariant: Skor tidak boleh seri jika kedua skor terisi.
   */
  function validateScore(match, rawA, rawB) {
    if (!match) {
      return {
        ok: false,
        code: ERROR_CODES.MATCH_NOT_FOUND,
        error: "Data pertandingan tidak ditemukan.",
        message: "Data pertandingan tidak ditemukan."
      };
    }

    const valA = (rawA === "" || rawA == null) ? "" : String(rawA).trim();
    const valB = (rawB === "" || rawB == null) ? "" : String(rawB).trim();

    // Jika kedua skor kosong, berarti belum ada input
    if (valA === "" && valB === "") {
      return {
        ok: false,
        code: ERROR_CODES.EMPTY_SCORE,
        error: "Skor pertandingan belum diisi.",
        message: "Skor pertandingan belum diisi."
      };
    }

    // Jika salah satu kosong, defaultkan otomatis ke 0 (user tidak dipaksa ketik 0 manual)
    const strA = valA === "" ? "0" : valA;
    const strB = valB === "" ? "0" : valB;

    if (!/^-?\d+$/.test(strA) || !/^-?\d+$/.test(strB)) {
      return {
        ok: false,
        code: ERROR_CODES.NOT_A_NUMBER,
        error: "Skor harus berupa angka bilangan bulat murni (tanpa huruf/desimal).",
        message: "Skor harus berupa angka bilangan bulat murni (tanpa huruf/desimal)."
      };
    }

    const sa = parseInt(strA, 10);
    const sb = parseInt(strB, 10);

    if (sa < 0 || sb < 0) {
      return {
        ok: false,
        code: ERROR_CODES.OUT_OF_RANGE,
        error: "Skor tidak boleh bernilai negatif.",
        message: "Skor tidak boleh bernilai negatif."
      };
    }

    if (sa > 999 || sb > 999) {
      return {
        ok: false,
        code: ERROR_CODES.OUT_OF_RANGE,
        error: "Skor maksimal yang diizinkan adalah 999.",
        message: "Skor maksimal yang diizinkan adalah 999."
      };
    }

    // Invariant Sistem Gugur: Tidak Boleh Seri
    if (sa === sb) {
      return {
        ok: false,
        code: ERROR_CODES.ANTI_DRAW,
        error: "Sistem gugur tidak boleh seri. Harus ada pemenang.",
        message: "Sistem gugur tidak boleh seri. Harus ada pemenang."
      };
    }

    const winner = sa > sb ? match.timA : match.timB;
    const loser = sa > sb ? match.timB : match.timA;

    return {
      ok: true,
      value: {
        skorA: sa,
        skorB: sb,
        winner,
        loser
      }
    };
  }

  /**
   * Memvalidasi pembuatan jadwal pertandingan baru.
   */
  function validateSchedule(candidate) {
    if (!candidate) {
      return {
        ok: false,
        code: ERROR_CODES.EMPTY_SCHEDULE,
        error: "Data jadwal tidak boleh kosong.",
        message: "Data jadwal tidak boleh kosong."
      };
    }

    const { timA, timB, tanggal } = candidate;

    if (!timA || !timB) {
      return {
        ok: false,
        code: ERROR_CODES.MISSING_TEAM,
        error: "Pilih Tim A dan Tim B.",
        message: "Pilih Tim A dan Tim B."
      };
    }

    if (String(timA).trim().toUpperCase() === String(timB).trim().toUpperCase()) {
      return {
        ok: false,
        code: ERROR_CODES.DUPLICATE_TEAM,
        error: "Tim tidak boleh sama.",
        message: "Tim tidak boleh sama."
      };
    }

    const t = String(tanggal || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return {
        ok: false,
        code: ERROR_CODES.INVALID_DATE,
        error: "Format tanggal tidak valid (YYYY-MM-DD).",
        message: "Format tanggal tidak valid (YYYY-MM-DD)."
      };
    }

    const parsedDate = new Date(t + 'T00:00:00Z');
    if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== t) {
      return {
        ok: false,
        code: ERROR_CODES.INVALID_DATE,
        error: "Tanggal yang dimasukkan bukan kalender yang sah.",
        message: "Tanggal yang dimasukkan bukan kalender yang sah."
      };
    }

    return { ok: true };
  }

  return {
    ERROR_CODES,
    partitionMatches,
    buildBracket,
    validateScore,
    validateSchedule
  };
})();

export default TournamentEngine;
