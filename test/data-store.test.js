import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import DataStoreModule from '../js/data-store.js';
const { DataStore, InMemoryTransportAdapter } = DataStoreModule;

describe('DataStore with InMemoryTransportAdapter (Storage & Remote Seam)', () => {
  test('syncFromRemote: berhasil menarik data dari adapter dan memperbarui state internal', async () => {
    const seed = {
      klasemen: [{ id: 1, tanggal: '2026-09-12', sakan: 'QAZVIN', kebersihan: 95 }],
      liga: [{ id: '101', timA: 'TIM A', timB: 'TIM B', status: 'UPCOMING' }],
      event: [],
      gedung: [{ id: 'qazvin', nama: 'QAZVIN' }],
      sakan: [{ id: 'qazvin-atas', nama: 'QAZVIN ATAS' }]
    };

    const adapter = new InMemoryTransportAdapter(seed);
    const store = new DataStore(adapter);
    store.init();

    const res = await store.syncFromRemote();
    assert.equal(res.status, 'success');
    assert.equal(store.getKlasemen().length, 1);
    assert.equal(store.getMatches().length, 1);
    assert.equal(store.getGedung().length, 1);
    assert.equal(store.getSakan().length, 1);
    assert.equal(store.getSyncState().status, 'online');
  });

  test('saveMatch: mutasi pertandingan berhasil disimpan optimis (0ms) dan tercatat di adapter', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('test_token_123');

    const newMatch = {
      id: 'm-99',
      round: 'Final',
      tanggal: '2026-09-20',
      timA: 'QAZVIN',
      timB: 'NAISABUR',
      skorA: 3,
      skorB: 2,
      status: 'SELESAI'
    };

    const res = await store.saveMatch(newMatch);
    assert.equal(res.status, 'success');
    assert.equal(res.optimistic, true);
    assert.equal(store.getMatches().length, 1);
    assert.equal(store.getMatches()[0].timA, 'QAZVIN');

    // Flush outbox di background
    await store.flushOutbox();

    // Status berubah menjadi synced
    assert.equal(store.getMatches()[0]._syncStatus, 'synced');
    assert.equal(adapter.pushedActions.length, 1);
    assert.equal(adapter.pushedActions[0].action, 'save_match');
    assert.equal(adapter.pushedActions[0].authToken, 'test_token_123');
  });

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

  test('saveKlasemenBulk: entri massal tersimpan optimis dan dikirim dalam 1 aksi bulk', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('token_bulk');

    const entries = [
      { tanggal: '2026-09-12', sakan: 'QAZVIN ATAS', kebersihan: 90, kedisiplinan: 85, bahasa: 88 },
      { tanggal: '2026-09-12', sakan: 'QAZVIN BAWAH', kebersihan: 95, kedisiplinan: 92, bahasa: 91 }
    ];

    const res = await store.saveKlasemenBulk(entries);
    assert.equal(res.status, 'success');
    assert.equal(res.count, 2);
    assert.equal(store.getKlasemen().length, 2);

    await store.flushOutbox();
    assert.equal(store.getKlasemen()[0]._syncStatus, 'synced');
    assert.equal(store.getKlasemen()[1]._syncStatus, 'synced');

    // Pastikan hanya 1 action dipush ke adapter
    assert.equal(adapter.pushedActions.length, 1);
    assert.equal(adapter.pushedActions[0].action, 'save_klasemen_bulk');
  });

  test('subscribe: pendengar dipanggil saat sinkronisasi data terjadi', async () => {
    const adapter = new InMemoryTransportAdapter({
      klasemen: [{ id: 1, sakan: 'TEST' }]
    });
    const store = new DataStore(adapter);
    store.init();

    let notifyCount = 0;
    const unsubscribe = store.subscribe(() => {
      notifyCount++;
    });

    await store.syncFromRemote();
    assert.ok(notifyCount >= 1);

    unsubscribe();
    await store.syncFromRemote();
    const countAfter = notifyCount;
    assert.equal(notifyCount, countAfter);
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

  test('saveEvent: penambahan agenda event baru dan pembaruan event tersimpan optimis serta tersinkron', async () => {
    const adapter = new InMemoryTransportAdapter();
    const store = new DataStore(adapter);
    store.init('evt_token');

    // 1. Simpan event baru
    const evt1 = {
      id: 'evt-1',
      kategori: 'Kajian',
      tanggal: '2026-09-15',
      waktu: '19:30',
      judul: 'Kajian Rutin Adab Santri',
      lokasi: 'Masjid Utama',
      foto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...'
    };
    await store.saveEvent(evt1);

    assert.equal(store.getEvents().length, 1);
    assert.equal(store.getEvents()[0].judul, 'Kajian Rutin Adab Santri');
    assert.equal(store.getEvents()[0]._syncStatus, 'synced');
    assert.equal(adapter.pushedActions.length, 1);
    assert.equal(adapter.pushedActions[0].action, 'save_event');
    assert.equal(adapter.pushedActions[0].authToken, 'evt_token');

    // 2. Update event yang sudah ada
    await store.saveEvent({
      id: 'evt-1',
      kategori: 'Kajian',
      tanggal: '2026-09-15',
      waktu: '20:00',
      judul: 'Kajian Rutin Adab Santri (Diundur)',
      lokasi: 'Aula Barat'
    });

    assert.equal(store.getEvents().length, 1, 'ID sama tidak boleh membuat duplikat');
    assert.equal(store.getEvents()[0].waktu, '20:00');
    assert.equal(store.getEvents()[0].judul, 'Kajian Rutin Adab Santri (Diundur)');
    assert.equal(adapter.pushedActions.length, 2);
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
});
