/**
 * =========================================================================
 * PERINGATAN / DISCLAIMER PENGUJIAN:
 * File ini adalah UNIT TEST LOKAL MURNI (IN-MEMORY MOCK).
 *
 * Tes ini HANYA memvalidasi logika internal state di RAM laptop:
 * - Manajemen antrean outbox & status sinkronisasi
 * - Optimistic update (model WhatsApp)
 * - Proteksi shallow copy & deduplikasi cache lokal
 * - Penanganan pembatalan mutasi dan circuit breaker 401
 *
 * PENTING:
 * Kelulusan tes ini SAMA SEKALI TIDAK MENJAMIN integrasi backend nyata sukses!
 * Hal-hal dunia nyata berikut TIDAK TERUJI di sini dan WAJIB diverifikasi
 * lewat Live Smoke Test ke Google Apps Script asli:
 * 1. Timeout eksekusi Google Apps Script (batas 30s) / cold start Vercel (10s)
 * 2. Kuota penyimpanan Google Drive atau izin folder tujuan
 * 3. Lock/konkurensi penulisan baris Spreadsheet Google Sheets
 * 4. Pergeseran nama tab sheet atau format tanggal otomatis Sheets
 * 5. Kegagalan jaringan HTTP real-world (DNS drop, socket hang up)
 * =========================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import DataStoreModule from '../js/data-store.js';
const { DataStore, InMemoryTransportAdapter } = DataStoreModule;

describe('DataStore with InMemoryTransportAdapter (Storage & Remote Seam)', () => {
  test('saveMatch: model WhatsApp (kegagalan transport tidak me-rollback data, melainkan berstatus failed)', async () => {
    const adapter = new InMemoryTransportAdapter();
    adapter.failNextPush = true;
    const store = new DataStore(adapter);
    store.init();

    const res = await store.saveMatch({ id: 'm-1', timA: 'A', timB: 'B' });
    assert.equal(res.status, 'success');
    assert.equal(store.getMatches().length, 1); // Data TIDAK hilang / tidak di-rollback!

    await store.flushOutbox();
    // Data tetap ada di layar tapi statusnya failed
    assert.equal(store.getMatches()[0]._syncStatus, 'failed');
    assert.equal(store.getSyncState().status, 'error');

    // Tes kemampuan Retry
    adapter.failNextPush = false;
    await store.retryMutation(store.getMatches()[0]._syncId);
    assert.equal(store.getMatches()[0]._syncStatus, 'synced');
    assert.equal(store.getSyncState().status, 'online');
  });

  test('deleteMatch: penghapusan lokal tidak dibangkitkan kembali (anti-zombie) saat syncFromRemote', async () => {
    const seed = {
      liga: [{ id: 'm-zombie', timA: 'TIM A', timB: 'TIM B', status: 'UPCOMING' }]
    };
    const adapter = new InMemoryTransportAdapter(seed);
    adapter.failNextPush = true; // Simulasi offline: push gagal sehingga aksi delete tetap pending di outbox
    const store = new DataStore(adapter);
    store.init();

    await store.syncFromRemote();
    assert.equal(store.getMatches().length, 1);

    // Hapus match secara lokal
    await store.deleteMatch('m-zombie');
    assert.equal(store.getMatches().length, 0);

    // Jalankan sync remote saat server remote masih memiliki m-zombie
    await store.syncFromRemote();
    // Match TIDAK BOLEH bangkit kembali!
    assert.equal(store.getMatches().length, 0, 'Match yang dihapus tidak boleh dibangkitkan kembali oleh remote sync');
  });

  test('deleteKlasemen: penghapusan lokal case-insensitive dan anti-zombie saat syncFromRemote', async () => {
    const seed = {
      klasemen: [{ id: 'k-1', tanggal: '2026-09-14', sakan: 'QAZVIN ATAS', kebersihan: 90 }]
    };
    const adapter = new InMemoryTransportAdapter(seed);
    adapter.failNextPush = true;
    const store = new DataStore(adapter);
    store.init();

    await store.syncFromRemote();
    assert.equal(store.getKlasemen().length, 1);

    // Hapus dengan variasi spasi / case: "qazvin atas "
    await store.deleteKlasemen('2026-09-14', 'qazvin atas ');
    assert.equal(store.getKlasemen().length, 0, 'Harus terhapus secara case-insensitive & trimmed');

    // Sync remote saat server masih memiliki data
    await store.syncFromRemote();
    assert.equal(store.getKlasemen().length, 0, 'Klasemen yang dihapus tidak boleh dibangkitkan kembali');
  });

  test('deleteEvent: penghapusan event lokal tidak dibangkitkan kembali saat syncFromRemote', async () => {
    const seed = {
      event: [{ id: 'e-101', judul: 'Kajian Akbar' }]
    };
    const adapter = new InMemoryTransportAdapter(seed);
    adapter.failNextPush = true;
    const store = new DataStore(adapter);
    store.init();

    await store.syncFromRemote();
    assert.equal(store.getEvents().length, 1);

    await store.deleteEvent('e-101');
    assert.equal(store.getEvents().length, 0);

    await store.syncFromRemote();
    assert.equal(store.getEvents().length, 0, 'Event yang dihapus tidak boleh dibangkitkan kembali');
  });

  test('saveKlasemen: partial update mempertahankan nilai bidang lain dan normalisasi case sakan', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init();

    // 1. Simpan nilai awal lengkap
    await store.saveKlasemen({
      tanggal: '2026-09-14',
      sakan: 'QAZVIN ATAS',
      kebersihan: 90,
      kedisiplinan: 80,
      bahasa: 70
    });
    assert.equal(store.getKlasemen().length, 1);
    assert.equal(store.getKlasemen()[0].totalPoin, 240);

    // 2. Partial update: hanya perbarui kebersihan dengan variasi lowercase & trailing space "qazvin atas "
    await store.saveKlasemen({
      tanggal: '2026-09-14',
      sakan: 'qazvin atas ',
      kebersihan: 95
    });

    // Harus tetap 1 record (tidak membuat record duplikat)
    assert.equal(store.getKlasemen().length, 1, 'Tidak boleh ada record duplikat akibat perbedaan case/spasi sakan');
    const updated = store.getKlasemen()[0];
    assert.equal(updated.kebersihan, 95);
    assert.equal(updated.kedisiplinan, 80, 'Nilai kedisiplinan lama harus tetap dipertahankan');
    assert.equal(updated.bahasa, 70, 'Nilai bahasa lama harus tetap dipertahankan');
    assert.equal(updated.totalPoin, 245);
  });


  test('clearLocalData: mengosongkan outbox, authToken, dan reset state in-memory saat logout', async () => {
    const adapter = new InMemoryTransportAdapter();
    adapter.failNextPush = true; // Biarkan outbox terisi
    const store = new DataStore(adapter);
    store.init('token_secret_123');

    await store.saveMatch({ id: 'm-pending', timA: 'A', timB: 'B' });
    assert.equal(store.getOutbox().length, 1);
    assert.equal(store.getMatches().length, 1);

    store.clearLocalData();
    assert.equal(store.authToken, '');
    assert.equal(store.getOutbox().length, 0);
    assert.equal(store.getMatches().length, 0);
    assert.equal(store.getKlasemen().length, 0);
    assert.equal(store.getEvents().length, 0);
  });

  test('retryAllFailed: mutasi massal yang berstatus failed berhasil diulang kembali saat jaringan pulih', async () => {
    const adapter = new InMemoryTransportAdapter();
    adapter.failNextPush = true; // Simulasi offline
    const store = new DataStore(adapter);
    store.init();

    // Buat 2 mutasi yang gagal terkirim
    await store.saveMatch({ id: 'm-f1', timA: 'A', timB: 'B' });
    await store.saveEvent({ id: 'e-f2', judul: 'Event Offline' });

    await store.flushOutbox();
    assert.equal(store.getOutbox().filter(o => o.status === 'failed').length, 2);
    assert.equal(store.getSyncState().status, 'error');

    // Jaringan pulih kembali
    adapter.failNextPush = false;
    await store.retryAllFailed();

    assert.equal(store.getOutbox().length, 0, 'Outbox harus kosong setelah retryAllFailed sukses');
    assert.equal(store.getMatches()[0]._syncStatus, 'synced');
    assert.equal(store.getEvents()[0]._syncStatus, 'synced');
    assert.equal(store.getSyncState().status, 'online');
  });

  test('outbox cancellation: create lalu delete saat offline membatalkan pending save di outbox', async () => {
    const adapter = new InMemoryTransportAdapter();
    adapter.failNextPush = true; // Simulasi offline
    const store = new DataStore(adapter);
    store.init();

    // 1. Buat match baru saat offline
    await store.saveMatch({ id: 'm-cancel', timA: 'TIM BIRU', timB: 'TIM MERAH' });
    assert.equal(store.getMatches().length, 1);
    assert.equal(store.getOutbox().some(o => o.action === 'save_match' && o.payload.id === 'm-cancel'), true);

    // 2. User berubah pikiran dan menghapus match tersebut sebelum online
    await store.deleteMatch('m-cancel');
    assert.equal(store.getMatches().length, 0);

    // Pastikan save_match yang pending telah dibuang dari outbox (dibatalkan sebelum dikirim)
    const outboxActions = store.getOutbox().map(o => o.action);
    assert.equal(outboxActions.includes('save_match'), false, 'Aksi save_match harus dibatalkan dari outbox saat didelete');

    // 3. Online kembali dan ulangi sinkronisasi
    adapter.failNextPush = false;
    await store.retryAllFailed();

    // Pastikan save_match tidak pernah dipush ke adapter
    const pushed = adapter.pushedActions.map(p => p.action);
    assert.equal(pushed.includes('save_match'), false, 'save_match tidak boleh dikirim ke server jika sudah dibatalkan');
    assert.equal(pushed.includes('delete_match'), true, 'Hanya delete_match yang dikirim sebagai tombstone');
  });

  test('_drainOutbox: auth failure (401) memicu sirkuit putus (break) dan tidak membanjiri request berikutnya', async () => {
    let pushAttempts = 0;
    const adapter = {
      async pull() { return { status: 'success', data: {} }; },
      async push(action, payload, token) {
        pushAttempts++;
        // Selalu return 401 Unauthorized
        return { status: 'error', code: 'ERR_UNAUTHORIZED', message: 'Sesi berakhir' };
      }
    };

    const store = new DataStore(adapter);
    store.init('expired_token');

    // Tambahkan 3 mutasi offline
    store.outbox = [
      { id: '1', entity: 'liga', action: 'save_match', payload: { id: 'm1' }, status: 'pending' },
      { id: '2', entity: 'liga', action: 'save_match', payload: { id: 'm2' }, status: 'pending' },
      { id: '3', entity: 'liga', action: 'save_match', payload: { id: 'm3' }, status: 'pending' }
    ];

    await store.flushOutbox();

    // Sirkuit putus: karena mutasi pertama 401, pushAttempts HARUS tepat 1 (tidak mencoba item 2 dan 3)
    assert.equal(pushAttempts, 1, 'Sirkuit harus putus saat 401 dan tidak membanjiri server dengan request berikutnya');
    assert.equal(store.getOutbox()[0].status, 'failed');
    assert.equal(store.getOutbox()[1].status, 'pending', 'Item kedua harus tetap pending menunggu login ulang');
  });

  test('_drainOutbox: mutasi baru yang masuk saat drain sedang berjalan tidak ter-starve dan ikut terproses', async () => {
    let pushOrder = [];
    let resolveFirstPush;
    const firstPushPromise = new Promise(resolve => { resolveFirstPush = resolve; });

    const adapter = {
      async pull() { return { status: 'success', data: {} }; },
      async push(action, payload) {
        pushOrder.push(action);
        if (action === 'save_match') {
          // Simulasi delay HTTP request pada mutasi pertama
          await firstPushPromise;
        }
        return { status: 'success' };
      }
    };

    const store = new DataStore(adapter);
    store.init();

    // 1. Picu drain dengan mutasi pertama (save_match) yang lambat
    const promise1 = store.saveMatch({ id: 'm-slow', timA: 'A', timB: 'B' });

    // 2. Di tengah-tengah push berlangsung, admin memasukkan mutasi kedua (save_event)
    await store.saveEvent({ id: 'e-fast', judul: 'Event Cepat' });

    // Pada saat ini, save_event telah masuk ke outbox sebagai pending
    assert.equal(store.getOutbox().some(o => o.action === 'save_event'), true);

    // 3. Sekarang selesaikan push pertama
    resolveFirstPush();
    await promise1;
    await store.flushOutbox();

    // Mutasi kedua (save_event) HARUS ikut ter-drain dan tidak tertahan/ter-starve!
    assert.equal(pushOrder.includes('save_match'), true);
    assert.equal(pushOrder.includes('save_event'), true);
    assert.equal(store.getOutbox().length, 0, 'Seluruh mutasi harus tuntas ter-drain');
  });

  test('deleteKlasemen: berhasil memangkas entri spesifik dari save_klasemen_bulk yang pending di outbox', async () => {
    const adapter = new InMemoryTransportAdapter();
    adapter.failNextPush = true; // Simulasi offline
    const store = new DataStore(adapter);
    store.init();

    // 1. Simpan bulk 2 sakan saat offline
    await store.saveKlasemenBulk([
      { tanggal: '2026-09-14', sakan: 'QAZVIN ATAS', kebersihan: 90 },
      { tanggal: '2026-09-14', sakan: 'BUKHARA', kebersihan: 85 }
    ]);
    assert.equal(store.getKlasemen().length, 2);
    assert.equal(store.getOutbox().length, 1);
    assert.equal(store.getOutbox()[0].action, 'save_klasemen_bulk');
    assert.equal(store.getOutbox()[0].payload.length, 2);

    // 2. Hapus sakan QAZVIN ATAS saat masih offline
    await store.deleteKlasemen('2026-09-14', 'QAZVIN ATAS');
    assert.equal(store.getKlasemen().length, 1);
    assert.equal(store.getKlasemen()[0].sakan, 'BUKHARA');

    // 3. Periksa outbox: payload bulk harus tinggal BUKHARA (QAZVIN ATAS terpotong dari bulk)
    const bulkOutbox = store.getOutbox().find(o => o.action === 'save_klasemen_bulk');
    assert.ok(bulkOutbox);
    assert.equal(bulkOutbox.payload.length, 1);
    assert.equal(bulkOutbox.payload[0].sakan, 'BUKHARA');

    // 4. Hapus juga sakan BUKHARA saat masih offline
    await store.deleteKlasemen('2026-09-14', 'BUKHARA');
    assert.equal(store.getKlasemen().length, 0);

    // Seluruh entri bulk habis, maka save_klasemen_bulk HARUS terhapus total dari outbox
    const remainingBulk = store.getOutbox().find(o => o.action === 'save_klasemen_bulk');
    assert.equal(remainingBulk, undefined, 'Aksi bulk harus terhapus dari outbox jika semua isinya telah didelete');
  });

  test('getters: shallow copy guard melindungi array internal dari mutasi in-place', async () => {
    const store = new DataStore(new InMemoryTransportAdapter({
      klasemen: [{ id: 1, sakan: 'QAZVIN' }],
      liga: [{ id: 'm1', timA: 'A', timB: 'B' }],
      event: [{ id: 'e1', judul: 'Event 1' }],
      gedung: [{ id: 'g1', nama: 'QAZVIN' }],
      sakan: [{ id: 's1', nama: 'QAZVIN ATAS' }]
    }));
    store.init();
    await store.syncFromRemote();
    // Klasemen
    const k = store.getKlasemen();
    k.push({ id: 99, sakan: 'MUTATED' });
    assert.equal(store.getKlasemen().length, 1);

    // Liga / Matches
    const m = store.getMatches();
    m.push({ id: 'm99' });
    assert.equal(store.getMatches().length, 1);

    // Event
    const e = store.getEvents();
    e.push({ id: 'e99' });
    assert.equal(store.getEvents().length, 1);

    // Gedung
    const g = store.getGedung();
    g.push({ id: 'g99' });
    assert.equal(store.getGedung().length, 1);

    // Sakan
    const s = store.getSakan();
    s.push({ id: 's99' });
    assert.equal(store.getSakan().length, 1);
  });

  test('saveEvent: alur preservasi poster lama dan penghapusan eksplisit saat edit event', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('evt_token');

    // 1. Simpan event dengan poster Drive dan unggahan fotoBase64
    await store.saveEvent({
      id: 'evt-poster-1',
      kategori: 'Event Umum',
      tanggal: '2026-09-18',
      waktu: '20:00',
      judul: 'Cerdas Berlogika',
      lokasi: 'Masjid',
      foto: 'https://drive.google.com/uc?id=poster_lama_123',
      fotoBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...'
    });

    assert.equal(store.getEvents()[0].foto, 'https://drive.google.com/uc?id=poster_lama_123');
    assert.equal(store.getEvents()[0].fotoBase64, undefined, 'fotoBase64 wajib distrip agar tidak membebani localStorage');

    // 2. Edit event teks saja: foto lama harus tetap terjaga
    await store.saveEvent({
      id: 'evt-poster-1',
      kategori: 'Event Umum',
      tanggal: '2026-09-18',
      waktu: '20:30',
      judul: 'Cerdas Berlogika (Update Waktu)',
      lokasi: 'Masjid Utama',
      foto: 'https://drive.google.com/uc?id=poster_lama_123'
    });

    assert.equal(store.getEvents()[0].foto, 'https://drive.google.com/uc?id=poster_lama_123');
    assert.equal(store.getEvents()[0].waktu, '20:30');

    // 3. Edit event dengan hapus foto eksplisit (foto: '')
    await store.saveEvent({
      id: 'evt-poster-1',
      kategori: 'Event Umum',
      tanggal: '2026-09-18',
      waktu: '20:30',
      judul: 'Cerdas Berlogika (Poster Dihapus)',
      lokasi: 'Masjid Utama',
      foto: ''
    });

    assert.equal(store.getEvents()[0].foto, '');
    assert.equal(store.getEvents()[0].judul, 'Cerdas Berlogika (Poster Dihapus)');
  });
});
