import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import StandingsEngine from '../js/standings-engine.js';
import TournamentEngine from '../js/tournament-engine.js';

describe('StandingsEngine (In-Process Pure Calculation)', () => {
  const sampleRecords = [
    { tanggal: '2026-09-10', sakan: 'QAZVIN ATAS', kebersihan: 90, kedisiplinan: 80, bahasa: 70 },
    { tanggal: '2026-09-10', sakan: 'NAISABUR', kebersihan: 85, kedisiplinan: 85, bahasa: 85 },
    { tanggal: '2026-09-11', sakan: 'QAZVIN ATAS', kebersihan: 100, kedisiplinan: null, bahasa: null }, // Per-field: hanya kebersihan terisi
    { tanggal: '2026-09-11', sakan: 'BUKHARA', kebersihan: 60, kedisiplinan: 60, bahasa: 60 }
  ];

  test('computeDailyStandings: menghitung rata-rata baris dengan validCount dinamis dan mengurutkan secara stabil', () => {
    const daily = StandingsEngine.computeDailyStandings(sampleRecords, { tanggal: '2026-09-11' });
    assert.equal(daily.length, 2);

    // QAZVIN ATAS memiliki nilai 100 di kebersihan, null di 2 lainnya -> rowAvg = 100.0 (bukan 33.3!)
    const qazvin = daily.find(d => d.sakan === 'QAZVIN ATAS');
    assert.ok(qazvin);
    assert.equal(qazvin.validCount, 1);
    assert.equal(qazvin.rowAvg, 100.0);
    assert.equal(qazvin.rank, 1); // Harus peringkat 1 mengalahkan Bukhara (avg 60.0)

    const bukhara = daily.find(d => d.sakan === 'BUKHARA');
    assert.ok(bukhara);
    assert.equal(bukhara.validCount, 3);
    assert.equal(bukhara.rowAvg, 60.0);
    assert.equal(bukhara.rank, 2);
  });

  test('computeDailyStandings: filter query sakan', () => {
    const daily = StandingsEngine.computeDailyStandings(sampleRecords, { query: 'naisabur' });
    assert.equal(daily.length, 1);
    assert.equal(daily[0].sakan, 'NAISABUR');
  });

  test('computeSummary: menghitung rata-rata akumulatif per sakan', () => {
    const summary = StandingsEngine.computeSummary(sampleRecords);
    assert.equal(summary.length, 3);

    const qazvin = summary.find(s => s.sakan === 'QAZVIN ATAS');
    assert.ok(qazvin);
    assert.equal(qazvin.jumlah, 2);
    // Kebersihan: (90 + 100) / 2 = 95.0
    // Kedisiplinan: 80 / 1 = 80.0
    // Bahasa: 70 / 1 = 70.0
    // Gabungan: (95 + 80 + 70) / 3 = 81.7
    assert.equal(qazvin.avgKeb, '95.0');
    assert.equal(qazvin.avgKed, '80.0');
    assert.equal(qazvin.avgBah, '70.0');
    assert.equal(qazvin.avgCombined, 81.7);
  });

  test('extractPodium: menyusun urutan spasial [Juara 2, Juara 1, Juara 3]', () => {
    const summary = StandingsEngine.computeSummary(sampleRecords);
    const podium = StandingsEngine.extractPodium(summary);

    assert.equal(podium.hasData, true);
    assert.equal(podium.slots.length, 3);

    // Slot 0 adalah Juara 2 (kiri, p2)
    assert.equal(podium.slots[0].rank, 2);
    assert.equal(podium.slots[0].cssClass, 'p2');

    // Slot 1 adalah Juara 1 (tengah, p1)
    assert.equal(podium.slots[1].rank, 1);
    assert.equal(podium.slots[1].cssClass, 'p1');

    // Slot 2 adalah Juara 3 (kanan, p3)
    assert.equal(podium.slots[2].rank, 3);
    assert.equal(podium.slots[2].cssClass, 'p3');
  });

  test('computeMetrics: menangani dataset kosong dengan aman', () => {
    const metrics = StandingsEngine.computeMetrics([]);
    assert.equal(metrics.count, 0);
    assert.equal(metrics.avgCombined, '0.0');
  });
});

describe('TournamentEngine (In-Process Pure Calculation)', () => {
  const sampleMatches = [
    { id: '1', round: 'Penyisihan', tanggal: '2026-09-01', timA: 'TIM BIRU', timB: 'TIM MERAH', skorA: 3, skorB: 1, status: 'SELESAI' },
    { id: '2', round: 'Penyisihan', tanggal: '2026-09-02', timA: 'TIM HIJAU', timB: 'TIM KUNING', skorA: 0, skorB: 2, status: 'SELESAI' },
    { id: '3', round: 'Semifinal', tanggal: '2026-09-05', timA: 'TIM BIRU', timB: 'TIM KUNING', skorA: 2, skorB: 1, status: 'SELESAI' },
    { id: '4', round: 'Final', tanggal: '2026-09-10', timA: 'TIM BIRU', timB: 'TIM HITAM', skorA: 4, skorB: 2, status: 'SELESAI' },
    { id: '5', round: 'Penyisihan', tanggal: '2026-09-15', waktu: '16:00', timA: 'TIM PUTIH', timB: 'TIM ABU', skorA: '', skorB: '', status: 'UPCOMING' }
  ];

  test('partitionMatches: memisahkan hasil selesai vs jadwal mendatang', () => {
    const { jadwalList, hasilList, liveMatch } = TournamentEngine.partitionMatches(sampleMatches);
    assert.equal(hasilList.length, 4);
    assert.equal(jadwalList.length, 1);
    assert.equal(jadwalList[0].id, '5');
    assert.equal(liveMatch, null);
  });

  test('buildBracket: menyusun relasi bagan dan menentukan juara turnamen', () => {
    const bracket = TournamentEngine.buildBracket(sampleMatches);
    assert.equal(bracket.rounds.penyisihan.length, 2);
    assert.equal(bracket.rounds.semifinal.length, 1);
    assert.equal(bracket.rounds.final.length, 1);

    assert.equal(bracket.isDecided, true);
    assert.equal(bracket.champion, 'TIM BIRU');
    assert.equal(bracket.runnerUp, 'TIM HITAM');
  });

  test('validateScore: menolak skor seri (anti-draw invariant pada sistem gugur) dengan kode error', () => {
    const match = { id: 'm1', timA: 'TIM A', timB: 'TIM B' };
    const res = TournamentEngine.validateScore(match, '2', '2');
    assert.equal(res.ok, false);
    assert.equal(res.code, 'ERR_ANTI_DRAW');
    assert.match(res.message, /tidak boleh seri/i);
  });

  test('validateScore: menolak skor non-angka dan di luar batas 0-999', () => {
    const match = { id: 'm1', timA: 'TIM A', timB: 'TIM B' };
    const resLetter = TournamentEngine.validateScore(match, '3a', '2');
    assert.equal(resLetter.ok, false);
    assert.equal(resLetter.code, 'ERR_NOT_A_NUMBER');

    const resOverflow = TournamentEngine.validateScore(match, '1000', '2');
    assert.equal(resOverflow.ok, false);
    assert.equal(resOverflow.code, 'ERR_OUT_OF_RANGE');
  });

  test('validateScore: menerima skor valid dan menentukan pemenang', () => {
    const match = { id: 'm1', timA: 'TIM A', timB: 'TIM B' };
    const res = TournamentEngine.validateScore(match, '3', '1');
    assert.equal(res.ok, true);
    assert.equal(res.value.skorA, 3);
    assert.equal(res.value.skorB, 1);
    assert.equal(res.value.winner, 'TIM A');
    assert.equal(res.value.loser, 'TIM B');
  });

  test('validateScore: otomatis mendefaultkan skor kosong ke 0 tanpa harus ketik manual', () => {
    const match = { id: 'm1', timA: 'TIM A', timB: 'TIM B' };
    const resA = TournamentEngine.validateScore(match, '2', '');
    assert.equal(resA.ok, true);
    assert.equal(resA.value.skorA, 2);
    assert.equal(resA.value.skorB, 0);
    assert.equal(resA.value.winner, 'TIM A');

    const resB = TournamentEngine.validateScore(match, '', '1');
    assert.equal(resB.ok, true);
    assert.equal(resB.value.skorA, 0);
    assert.equal(resB.value.skorB, 1);
    assert.equal(resB.value.winner, 'TIM B');

    const resEmpty = TournamentEngine.validateScore(match, '', '');
    assert.equal(resEmpty.ok, false);
    assert.equal(resEmpty.code, 'ERR_EMPTY_SCORE');
  });

  test('validateSchedule: menolak tim yang sama dan tanggal tidak valid', () => {
    const resSame = TournamentEngine.validateSchedule({
      timA: 'QAZVIN',
      timB: 'qazvin',
      tanggal: '2026-09-12'
    });
    assert.equal(resSame.ok, false);
    assert.equal(resSame.code, 'ERR_DUPLICATE_TEAM');

    const resDate = TournamentEngine.validateSchedule({
      timA: 'QAZVIN',
      timB: 'NAISABUR',
      tanggal: '2026-02-31'
    });
    assert.equal(resDate.ok, false);
    assert.equal(resDate.code, 'ERR_INVALID_DATE');
  });

  test('StandingsEngine.validateEntry: validasi rentang nilai 0-100 dan tipe murni', () => {
    const resOk = StandingsEngine.validateEntry({
      tanggal: '2026-09-12',
      sakan: 'QAZVIN ATAS',
      kebersihan: '95',
      kedisiplinan: 80,
      bahasa: null
    });
    assert.equal(resOk.ok, true);
    assert.equal(resOk.value.kebersihan, 95);

    // Nilai di atas 100 ditolak dengan kode ERR_OUT_OF_RANGE
    const resMax = StandingsEngine.validateEntry({
      tanggal: '2026-09-12',
      sakan: 'QAZVIN ATAS',
      kebersihan: 105
    });
    assert.equal(resMax.ok, false);
    assert.equal(resMax.code, 'ERR_OUT_OF_RANGE');

    // Huruf / desimal ditolak dengan kode ERR_NOT_A_NUMBER
    const resLetter = StandingsEngine.validateEntry({
      tanggal: '2026-09-12',
      sakan: 'QAZVIN ATAS',
      kebersihan: '95abc'
    });
    assert.equal(resLetter.ok, false);
    assert.equal(resLetter.code, 'ERR_NOT_A_NUMBER');
  });

  test('StandingsEngine.validateBulk: memvalidasi input massal dan melewati baris kosong', () => {
    const bulkData = [
      { tanggal: '2026-09-12', sakan: 'SAKAN 1', kebersihan: 90, kedisiplinan: 90, bahasa: 90 },
      { tanggal: '2026-09-12', sakan: 'SAKAN 2', kebersihan: '', kedisiplinan: '', bahasa: '' }, // dilewati
      { tanggal: '2026-09-12', sakan: 'SAKAN 3', kebersihan: 85, kedisiplinan: null, bahasa: null }
    ];
    const res = StandingsEngine.validateBulk(bulkData);
    assert.equal(res.ok, true);
    assert.equal(res.validEntries.length, 2);
    assert.equal(res.validEntries[0].sakan, 'SAKAN 1');
    assert.equal(res.validEntries[1].sakan, 'SAKAN 3');
  });
});
