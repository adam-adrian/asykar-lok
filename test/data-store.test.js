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
});
