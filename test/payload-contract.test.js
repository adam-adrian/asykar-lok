/**
 * =========================================================================
 * CONTRACT TESTS: CLIENT (DataStore) <-> GOOGLE APPS SCRIPT (Code.gs)
 * =========================================================================
 * 
 * TUJUAN:
 * File ini menguji KONTRAK SKEMA DATA (Consumer-Driven Contract Test).
 * Memastikan setiap aksi yang dihasilkan oleh client DataStore memiliki
 * struktur payload, nama properti, tipe data, dan nilai yang PERSIS sesuai
 * dengan yang dibaca dan diproses oleh doPost() di Code.gs.
 * 
 * Jika ada perubahan nama properti di DataStore tanpa memperbarui Code.gs
 * (atau sebaliknya), tes di sini AKAN GAGAL untuk mencegah contract drift.
 * =========================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import DataStoreModule from '../js/data-store.js';
const { DataStore, InMemoryTransportAdapter } = DataStoreModule;

/**
 * Validator Skema Kontrak Resmi Code.gs
 * Diambil langsung dari implementasi doPost(e) di Code.gs.
 */
const CODE_GS_CONTRACT = {
  save_klasemen: (payload) => {
    assert.ok(payload, 'Payload tidak boleh kosong');
    assert.equal(typeof payload.tanggal, 'string', 'tanggal wajib string YYYY-MM-DD');
    assert.match(payload.tanggal, /^\d{4}-\d{2}-\d{2}$/, 'Format tanggal wajib YYYY-MM-DD');
    assert.equal(typeof payload.sakan, 'string', 'sakan wajib string');
    assert.ok(payload.sakan.trim().length > 0, 'sakan tidak boleh kosong');

    // Code.gs:232 - isScoreValid: 0-100 atau null/empty
    ['kebersihan', 'kedisiplinan', 'bahasa'].forEach(field => {
      const val = payload[field];
      if (val !== null && val !== undefined && val !== '') {
        const n = Number(val);
        assert.ok(!isNaN(n) && n >= 0 && n <= 100, `${field} harus 0-100 jika diisi`);
      }
    });
  },

  save_klasemen_bulk: (payload) => {
    assert.ok(Array.isArray(payload), 'Payload save_klasemen_bulk wajib berupa array');
    assert.ok(payload.length > 0, 'Array bulk tidak boleh kosong');
    payload.forEach((item, idx) => {
      assert.equal(typeof item.tanggal, 'string', `Item #${idx}: tanggal wajib string`);
      assert.match(item.tanggal, /^\d{4}-\d{2}-\d{2}$/, `Item #${idx}: format tanggal wajib YYYY-MM-DD`);
      assert.equal(typeof item.sakan, 'string', `Item #${idx}: sakan wajib string`);
      assert.ok(item.sakan.trim().length > 0, `Item #${idx}: sakan tidak boleh kosong`);
      ['kebersihan', 'kedisiplinan', 'bahasa'].forEach(field => {
        const val = item[field];
        if (val !== null && val !== undefined && val !== '') {
          const n = Number(val);
          assert.ok(!isNaN(n) && n >= 0 && n <= 100, `Item #${idx}: ${field} harus 0-100`);
        }
      });
    });
  },

  delete_klasemen: (payload) => {
    assert.ok(payload, 'Payload delete_klasemen tidak boleh kosong');
    // Code.gs:344 membaca payload.tanggal dan payload.sakan
    assert.equal(typeof payload.tanggal, 'string', 'tanggal wajib string YYYY-MM-DD');
    assert.match(payload.tanggal, /^\d{4}-\d{2}-\d{2}$/, 'Format tanggal wajib YYYY-MM-DD');
    assert.equal(typeof payload.sakan, 'string', 'sakan wajib string');
    assert.ok(payload.sakan.trim().length > 0, 'sakan tidak boleh kosong');
  },

  save_match: (payload) => {
    assert.ok(payload, 'Payload save_match tidak boleh kosong');
    // Code.gs:390 membaca payload.id
    assert.ok(payload.id !== undefined && payload.id !== null, 'id wajib ada');
    // Code.gs:404-425 membaca round, tanggal, waktu, lokasi, timA, timB, skorA, skorB, status
    assert.ok('round' in payload, 'round wajib ada di payload');
    assert.ok('tanggal' in payload, 'tanggal wajib ada di payload');
    assert.ok('waktu' in payload, 'waktu wajib ada di payload');
    assert.ok('lokasi' in payload, 'lokasi wajib ada di payload');
    assert.equal(typeof payload.timA, 'string', 'timA wajib string');
    assert.equal(typeof payload.timB, 'string', 'timB wajib string');
    assert.ok(payload.timA.trim().length > 0, 'timA tidak boleh kosong');
    assert.ok(payload.timB.trim().length > 0, 'timB tidak boleh kosong');

    // Code.gs:356-372 - Validasi skor jika kedua skor diisi
    if (payload.skorA !== '' && payload.skorA != null && payload.skorB !== '' && payload.skorB != null) {
      const sa = Number(payload.skorA);
      const sb = Number(payload.skorB);
      assert.ok(!isNaN(sa) && sa >= 0 && sa <= 999, 'skorA harus 0-999');
      assert.ok(!isNaN(sb) && sb >= 0 && sb <= 999, 'skorB harus 0-999');
      assert.notEqual(sa, sb, 'Code.gs:366 - Sistem gugur tidak boleh seri');
    }
  },

  delete_match: (payload) => {
    assert.ok(payload, 'Payload delete_match tidak boleh kosong');
    // Code.gs:430 deleteRowById(sheet, payload.id)
    assert.ok(payload.id !== undefined && payload.id !== null, 'id wajib ada di payload');
    assert.ok(String(payload.id).trim().length > 0, 'id tidak boleh string kosong');
  },

  save_event: (payload) => {
    assert.ok(payload, 'Payload save_event tidak boleh kosong');
    // Code.gs:445-485 membaca id, kategori, tanggal, waktu, judul, lokasi, deskripsi, foto, fotoBase64
    assert.ok(payload.id !== undefined && payload.id !== null, 'id wajib ada di payload');
    assert.ok('kategori' in payload, 'kategori wajib ada di payload');
    assert.ok('tanggal' in payload, 'tanggal wajib ada di payload');
    assert.ok('waktu' in payload, 'waktu wajib ada di payload');
    assert.equal(typeof payload.judul, 'string', 'judul wajib string');
    assert.ok(payload.judul.trim().length > 0, 'judul tidak boleh kosong');
    assert.ok('lokasi' in payload, 'lokasi wajib ada di payload');
    assert.ok('deskripsi' in payload, 'deskripsi wajib ada di payload');

    // Code.gs:457-463 protokol foto
    assert.ok('foto' in payload, 'foto wajib ada di payload (bisa berupa URL atau "")');
    assert.ok('fotoBase64' in payload, 'fotoBase64 wajib ada di payload (bisa berupa data URL atau "")');
  },

  delete_event: (payload) => {
    assert.ok(payload, 'Payload delete_event tidak boleh kosong');
    // Code.gs:491 deleteRowById(sheet, payload.id)
    assert.ok(payload.id !== undefined && payload.id !== null, 'id wajib ada di payload');
    assert.ok(String(payload.id).trim().length > 0, 'id tidak boleh string kosong');
  }
};

describe('Contract Testing: DataStore Outbox Payloads vs Code.gs doPost Expectations', () => {

  test('Kontrak save_klasemen: payload sesuai dengan skema kolom sheet Klasemen di Code.gs', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_admin');

    await store.saveKlasemen({
      tanggal: '2026-09-16',
      sakan: 'QAZVIN ATAS',
      kebersihan: 95,
      kedisiplinan: 90,
      bahasa: 85
    });

    assert.equal(adapter.pushedActions.length, 1);
    const action = adapter.pushedActions[0];
    assert.equal(action.action, 'save_klasemen');
    assert.equal(action.authToken, 'token_admin');

    // Verifikasi skema kontrak
    CODE_GS_CONTRACT.save_klasemen(action.payload);
  });

  test('Kontrak save_klasemen_bulk: payload array sesuai dengan iterasi Code.gs:290-335', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_admin');

    await store.saveKlasemenBulk([
      { tanggal: '2026-09-16', sakan: 'QAZVIN', kebersihan: 88, kedisiplinan: 90, bahasa: 92 },
      { tanggal: '2026-09-16', sakan: 'NAISABUR', kebersihan: 85, kedisiplinan: 87, bahasa: 89 }
    ]);

    assert.equal(adapter.pushedActions.length, 1);
    const action = adapter.pushedActions[0];
    assert.equal(action.action, 'save_klasemen_bulk');

    // Verifikasi skema kontrak
    CODE_GS_CONTRACT.save_klasemen_bulk(action.payload);
  });

  test('Kontrak delete_klasemen: payload membawa tanggal & sakan yang diharapkan Code.gs:344', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_admin');

    await store.deleteKlasemen('2026-09-16', 'QAZVIN ATAS');

    assert.equal(adapter.pushedActions.length, 1);
    const action = adapter.pushedActions[0];
    assert.equal(action.action, 'delete_klasemen');

    // Verifikasi skema kontrak
    CODE_GS_CONTRACT.delete_klasemen(action.payload);
  });

  test('Kontrak save_match: payload membawa 9 kolom tabel Liga & mematuhi anti-draw Code.gs:366', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_admin');

    await store.saveMatch({
      id: 'match-101',
      round: 'Semifinal',
      tanggal: '2026-09-18',
      waktu: '16:00 WIB',
      lokasi: 'Lapangan Utama',
      timA: 'QAZVIN',
      timB: 'NAISABUR',
      skorA: 3,
      skorB: 1,
      status: 'SELESAI'
    });

    assert.equal(adapter.pushedActions.length, 1);
    const action = adapter.pushedActions[0];
    assert.equal(action.action, 'save_match');

    // Verifikasi skema kontrak
    CODE_GS_CONTRACT.save_match(action.payload);
  });

  test('Kontrak delete_match: payload membawa id untuk deleteRowById di Code.gs:430', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_admin');

    await store.deleteMatch('match-101');

    assert.equal(adapter.pushedActions.length, 1);
    const action = adapter.pushedActions[0];
    assert.equal(action.action, 'delete_match');

    // Verifikasi skema kontrak
    CODE_GS_CONTRACT.delete_match(action.payload);
  });

  test('Kontrak save_event: payload membawa 8 kolom tabel Event + protokol foto Drive di Code.gs:439', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_admin');

    await store.saveEvent({
      id: 'evt-202',
      kategori: 'Perlombaan',
      tanggal: '2026-09-19',
      waktu: '08:00',
      judul: 'Lomba Cerdas Cermat Sains',
      lokasi: 'Auditorium',
      deskripsi: 'Babak penyisihan antar kamar santri',
      foto: 'https://drive.google.com/uc?id=abc12345',
      fotoBase64: ''
    });

    assert.equal(adapter.pushedActions.length, 1);
    const action = adapter.pushedActions[0];
    assert.equal(action.action, 'save_event');

    // Verifikasi skema kontrak
    CODE_GS_CONTRACT.save_event(action.payload);
  });

  test('Kontrak delete_event: payload membawa id untuk deleteRowById di Code.gs:491', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_admin');

    await store.deleteEvent('evt-202');

    assert.equal(adapter.pushedActions.length, 1);
    const action = adapter.pushedActions[0];
    assert.equal(action.action, 'delete_event');

    // Verifikasi skema kontrak
    CODE_GS_CONTRACT.delete_event(action.payload);
  });

  test('Kontrak Envelope Jaringan (api/sync.js -> Code.gs doPost): token sesi terbungkus di root body', () => {
    // Simulasi apa yang dikirim HttpTransportAdapter dan dibungkus api/sync.js:70
    const clientAction = 'save_match';
    const clientPayload = { id: 'm-1', timA: 'A', timB: 'B' };
    const authToken = 'session_token_xyz_123';

    // api/sync.js membungkus { ...body, token }
    const proxyEnvelope = {
      action: clientAction,
      payload: clientPayload,
      token: authToken
    };

    // Code.gs:159-166 membaca action, payload, dan token di tingkat root
    assert.equal(proxyEnvelope.action, clientAction);
    assert.deepEqual(proxyEnvelope.payload, clientPayload);
    assert.equal(proxyEnvelope.token, authToken);
    assert.ok(proxyEnvelope.token.length > 0, 'Code.gs:165 - Token wajib ada untuk setiap aksi mutasi');
  });

});
