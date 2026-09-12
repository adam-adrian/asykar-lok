/**
 * data-store.js - Storage & Remote Seam Module
 * Bertanggung jawab atas in-memory state, disk persistence (localStorage),
 * token autentikasi sesi, pencegahan double-sync, dan transport adapter.
 * 
 * Sifat: Deep Module dengan port di remote seam (HttpTransport vs InMemoryTransport).
 */

(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    global.DataStoreModule = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEYS = {
    KLASEMEN: 'lok-klasemen-v5',
    LIGA: 'lok-liga-v5',
    EVENT: 'lok-event-v5',
    GEDUNG: 'lok-gedung-v5',
    SAKAN: 'lok-sakan-v5',
    OUTBOX: 'lok-outbox-v5'
  };

  /**
   * Adapter 1: HttpTransportAdapter (Produksi & Dev Server)
   * Berkomunikasi melintasi jaringan ke /api/sync.
   */
  class HttpTransportAdapter {
    constructor(endpoint = '/api/sync') {
      this.endpoint = endpoint;
    }

    async pull() {
      const res = await fetch(this.endpoint);
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        return {
          status: 'success',
          local: Boolean(json.local),
          data: {
            klasemen: Array.isArray(json.data.klasemen) ? json.data.klasemen : [],
            liga: Array.isArray(json.data.liga) ? json.data.liga : [],
            event: Array.isArray(json.data.event) ? json.data.event : [],
            gedung: Array.isArray(json.data.gedung) ? json.data.gedung : [],
            sakan: Array.isArray(json.data.sakan) ? json.data.sakan : []
          }
        };
      }
      throw new Error(json.message || 'Gagal mengambil data dari server.');
    }

    async push(action, payload, authToken = '') {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? 'Bearer ' + authToken : ''
        },
        body: JSON.stringify({ action, payload })
      });
      const json = await res.json();
      return json;
    }
  }

  /**
   * Adapter 2: InMemoryTransportAdapter (Automated Tests & Offline Mock)
   */
  class InMemoryTransportAdapter {
    constructor(seed = {}) {
      this.db = {
        klasemen: seed.klasemen || [],
        liga: seed.liga || [],
        event: seed.event || [],
        gedung: seed.gedung || [],
        sakan: seed.sakan || []
      };
      this.pushedActions = [];
      this.failNextPull = false;
      this.failNextPush = false;
    }

    async pull() {
      if (this.failNextPull) {
        throw new Error('Simulasi kegagalan koneksi jaringan.');
      }
      return {
        status: 'success',
        local: true,
        data: JSON.parse(JSON.stringify(this.db))
      };
    }

    async push(action, payload, authToken = '') {
      if (this.failNextPush) {
        return { status: 'error', message: 'Simulasi kegagalan push remote.' };
      }
      this.pushedActions.push({ action, payload, authToken });
      return { status: 'success', local: true };
    }
  }

  /**
   * Memory/LocalStorage Helper
   */
  function safeStorageGet(key, fallback = []) {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function safeStorageSet(key, val) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      // QuotaExceededError or private browsing
    }
  }

  /**
   * Core Deep Module: DataStore
   */
  class DataStore {
    constructor(transportAdapter = null) {
      this.adapter = transportAdapter || new HttpTransportAdapter();
      this.authToken = '';
      this.isSyncing = false;
      this.isDrainingOutbox = false;
      this.outbox = [];

      // Internal State (Single source of truth in memory)
      this.state = {
        klasemen: [],
        liga: [],
        event: [],
        gedung: [],
        sakan: [],
        sync: {
          status: 'online', // 'loading' | 'online' | 'local' | 'error'
          label: 'Memuat...'
        }
      };

      this.listeners = [];
    }

    init(authToken = '') {
      this.authToken = authToken || '';

      // Seed in-memory cache dari localStorage
      this.state.klasemen = safeStorageGet(STORAGE_KEYS.KLASEMEN, []);
      this.state.liga = safeStorageGet(STORAGE_KEYS.LIGA, []);
      this.state.event = safeStorageGet(STORAGE_KEYS.EVENT, []);
      this.state.gedung = safeStorageGet(STORAGE_KEYS.GEDUNG, []);
      this.state.sakan = safeStorageGet(STORAGE_KEYS.SAKAN, []);
      this.outbox = safeStorageGet(STORAGE_KEYS.OUTBOX, []);

      // Evaluasi status awal berdasarkan outbox
      const pendingCount = this.outbox.filter(i => i.status === 'pending').length;
      const failedCount = this.outbox.filter(i => i.status === 'failed').length;

      if (failedCount > 0) {
        this._setSyncStatus('error', `${failedCount} data belum tersinkron`);
      } else if (pendingCount > 0) {
        this._setSyncStatus('loading', 'Menyinkronkan antrean...');
        this._drainOutbox();
      } else {
        this._setSyncStatus('online', 'Siap');
      }
      this._notify();
    }

    setAuthToken(token) {
      this.authToken = token || '';
    }

    getKlasemen() {
      return this.state.klasemen;
    }

    getMatches() {
      return this.state.liga;
    }

    getEvents() {
      return this.state.event;
    }

    getGedung() {
      return this.state.gedung;
    }

    getSakan() {
      return this.state.sakan;
    }

    getOutbox() {
      return [...this.outbox];
    }

    getSyncState() {
      return { ...this.state.sync, isBusy: this.isSyncing || this.isDrainingOutbox };
    }

    subscribe(listener) {
      if (typeof listener === 'function') {
        this.listeners.push(listener);
      }
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }

    _notify() {
      const snap = {
        klasemen: this.state.klasemen,
        liga: this.state.liga,
        event: this.state.event,
        gedung: this.state.gedung,
        sakan: this.state.sakan,
        sync: { ...this.state.sync }
      };
      this.listeners.forEach(l => {
        try { l(snap); } catch (err) { console.error('DataStore listener error:', err); }
      });
    }

    _setSyncStatus(status, label) {
      this.state.sync.status = status;
      this.state.sync.label = label;
      this._notify();
    }

    _addOutbox(entity, action, payload, syncId) {
      const id = syncId || ('mut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      const entry = {
        id,
        entity,
        action,
        payload,
        status: 'pending',
        error: null,
        timestamp: Date.now(),
        retryCount: 0
      };
      this.outbox.push(entry);
      safeStorageSet(STORAGE_KEYS.OUTBOX, this.outbox);
      return id;
    }

    _markEntitySyncStatus(entity, payload, syncId, status, error) {
      if (entity === 'klasemen') {
        if (Array.isArray(payload)) {
          payload.forEach(item => {
            const found = this.state.klasemen.find(r => r.tanggal === item.tanggal && r.sakan === item.sakan);
            if (found) {
              found._syncStatus = status;
              found._syncError = error;
              found._syncId = syncId;
            }
          });
        } else {
          const found = this.state.klasemen.find(r => r.tanggal === payload.tanggal && r.sakan === payload.sakan);
          if (found) {
            found._syncStatus = status;
            found._syncError = error;
            found._syncId = syncId;
          }
        }
        safeStorageSet(STORAGE_KEYS.KLASEMEN, this.state.klasemen);
      } else if (entity === 'liga') {
        const found = this.state.liga.find(r => String(r.id) === String(payload.id));
        if (found) {
          found._syncStatus = status;
          found._syncError = error;
          found._syncId = syncId;
        }
        safeStorageSet(STORAGE_KEYS.LIGA, this.state.liga);
      } else if (entity === 'event') {
        const found = this.state.event.find(r => String(r.id) === String(payload.id));
        if (found) {
          found._syncStatus = status;
          found._syncError = error;
          found._syncId = syncId;
        }
        safeStorageSet(STORAGE_KEYS.EVENT, this.state.event);
      }
    }

    /**
     * Draining antrean Outbox secara serial di background (WhatsApp model)
     */
    async _drainOutbox() {
      if (this.isDrainingOutbox) return;
      this.isDrainingOutbox = true;

      const pendingItems = this.outbox.filter(item => item.status === 'pending');
      if (!pendingItems.length) {
        this.isDrainingOutbox = false;
        const failedCount = this.outbox.filter(i => i.status === 'failed').length;
        if (failedCount > 0) {
          this._setSyncStatus('error', `${failedCount} data belum tersinkron`);
        } else {
          this._setSyncStatus('online', 'Cloud Terhubung');
        }
        return;
      }

      this._setSyncStatus('loading', 'Menyinkronkan...');

      for (const item of pendingItems) {
        try {
          const res = await this.adapter.push(item.action, item.payload, this.authToken);
          if (res && res.status === 'success') {
            this._markEntitySyncStatus(item.entity, item.payload, item.id, 'synced', null);
            this.outbox = this.outbox.filter(o => o.id !== item.id);
            safeStorageSet(STORAGE_KEYS.OUTBOX, this.outbox);
          } else {
            const errMsg = (res && res.message) || 'Gagal tersinkron ke server.';
            item.status = 'failed';
            item.error = errMsg;
            item.retryCount = (item.retryCount || 0) + 1;
            this._markEntitySyncStatus(item.entity, item.payload, item.id, 'failed', errMsg);
            safeStorageSet(STORAGE_KEYS.OUTBOX, this.outbox);
          }
        } catch (err) {
          const errMsg = err.message || 'Koneksi jaringan terputus.';
          item.status = 'failed';
          item.error = errMsg;
          item.retryCount = (item.retryCount || 0) + 1;
          this._markEntitySyncStatus(item.entity, item.payload, item.id, 'failed', errMsg);
          safeStorageSet(STORAGE_KEYS.OUTBOX, this.outbox);
        }
      }

      this.isDrainingOutbox = false;
      const remainingFailed = this.outbox.filter(o => o.status === 'failed').length;
      if (remainingFailed > 0) {
        this._setSyncStatus('error', `${remainingFailed} data belum tersinkron`);
      } else {
        this._setSyncStatus('online', 'Cloud Terhubung');
      }
      this._notify();
    }

    /**
     * Memaksa proses antrean outbox sampai selesai
     */
    async flushOutbox() {
      await this._drainOutbox();
    }

    /**
     * Ulangi pengiriman item yang gagal (Retry button di UI)
     */
    async retryMutation(syncId) {
      const item = this.outbox.find(o => o.id === syncId);
      if (item) {
        item.status = 'pending';
        item.error = null;
        this._markEntitySyncStatus(item.entity, item.payload, item.id, 'pending', null);
        safeStorageSet(STORAGE_KEYS.OUTBOX, this.outbox);
        await this._drainOutbox();
      }
    }

    /**
     * Ulangi semua item yang gagal di outbox
     */
    async retryAllFailed() {
      this.outbox.forEach(item => {
        if (item.status === 'failed') {
          item.status = 'pending';
          item.error = null;
          this._markEntitySyncStatus(item.entity, item.payload, item.id, 'pending', null);
        }
      });
      safeStorageSet(STORAGE_KEYS.OUTBOX, this.outbox);
      await this._drainOutbox();
    }

    /**
     * Sinkronisasi data dari server remote (Google Apps Script via Proxy).
     * Melindungi entri lokal yang statusnya masih 'pending'.
     */
    async syncFromRemote(isManual = false) {
      if (this.isSyncing) return { status: 'busy' };
      this.isSyncing = true;
      this._setSyncStatus('loading', 'Sinkronisasi...');

      try {
        const res = await this.adapter.pull();
        if (res.status === 'success' && res.data) {
          const pendingKlasemenKeys = new Set(
            this.outbox.filter(o => o.entity === 'klasemen').map(o => {
              if (Array.isArray(o.payload)) return o.payload.map(p => `${p.tanggal}_${p.sakan}`);
              return `${o.payload.tanggal}_${o.payload.sakan}`;
            }).flat()
          );
          const pendingLigaIds = new Set(
            this.outbox.filter(o => o.entity === 'liga').map(o => String(o.payload.id))
          );
          const pendingEventIds = new Set(
            this.outbox.filter(o => o.entity === 'event').map(o => String(o.payload.id))
          );

          // Merge Klasemen: pertahankan perubahan lokal yang masih pending
          const remoteKlasemen = res.data.klasemen || [];
          const mergedKlasemen = remoteKlasemen.map(rk => {
            const key = `${rk.tanggal}_${rk.sakan}`;
            if (pendingKlasemenKeys.has(key)) {
              const localPending = this.state.klasemen.find(l => `${l.tanggal}_${l.sakan}` === key);
              return localPending || rk;
            }
            return { ...rk, _syncStatus: 'synced' };
          });
          this.state.klasemen.forEach(lk => {
            const key = `${lk.tanggal}_${lk.sakan}`;
            if (pendingKlasemenKeys.has(key) && !mergedKlasemen.some(m => `${m.tanggal}_${m.sakan}` === key)) {
              mergedKlasemen.push(lk);
            }
          });
          this.state.klasemen = mergedKlasemen;

          // Merge Liga: pertahankan yang pending
          const remoteLiga = res.data.liga || [];
          const mergedLiga = remoteLiga.map(rl => {
            const id = String(rl.id);
            if (pendingLigaIds.has(id)) {
              const localPending = this.state.liga.find(l => String(l.id) === id);
              return localPending || rl;
            }
            return { ...rl, _syncStatus: 'synced' };
          });
          this.state.liga.forEach(ll => {
            const id = String(ll.id);
            if (pendingLigaIds.has(id) && !mergedLiga.some(m => String(m.id) === id)) {
              mergedLiga.push(ll);
            }
          });
          this.state.liga = mergedLiga;

          // Merge Event: pertahankan yang pending
          const remoteEvent = res.data.event || [];
          const mergedEvent = remoteEvent.map(re => {
            const id = String(re.id);
            if (pendingEventIds.has(id)) {
              const localPending = this.state.event.find(l => String(l.id) === id);
              return localPending || re;
            }
            return { ...re, _syncStatus: 'synced' };
          });
          this.state.event.forEach(le => {
            const id = String(le.id);
            if (pendingEventIds.has(id) && !mergedEvent.some(m => String(m.id) === id)) {
              mergedEvent.push(le);
            }
          });
          this.state.event = mergedEvent;

          if (res.data.gedung && res.data.gedung.length) this.state.gedung = res.data.gedung;
          if (res.data.sakan && res.data.sakan.length) this.state.sakan = res.data.sakan;

          safeStorageSet(STORAGE_KEYS.KLASEMEN, this.state.klasemen);
          safeStorageSet(STORAGE_KEYS.LIGA, this.state.liga);
          safeStorageSet(STORAGE_KEYS.EVENT, this.state.event);
          if (this.state.gedung.length) safeStorageSet(STORAGE_KEYS.GEDUNG, this.state.gedung);
          if (this.state.sakan.length) safeStorageSet(STORAGE_KEYS.SAKAN, this.state.sakan);

          this.isSyncing = false;
          const failedCount = this.outbox.filter(i => i.status === 'failed').length;
          if (failedCount > 0) {
            this._setSyncStatus('error', `${failedCount} data belum tersinkron`);
          } else {
            this._setSyncStatus('online', res.local ? 'Mode Lokal' : 'Cloud Terhubung');
          }
          return { status: 'success', local: res.local };
        }
        throw new Error('Payload sinkronisasi tidak valid.');
      } catch (err) {
        this.isSyncing = false;
        this._setSyncStatus('local', 'Cache Offline');
        return { status: 'error', message: err.message || 'Gagal sinkronisasi data.' };
      }
    }

    /**
     * Mutasi: Simpan poin klasemen tunggal (WhatsApp-Style Optimistic Write)
     */
    async saveKlasemen(payload) {
      const { tanggal, sakan, kebersihan, kedisiplinan, bahasa } = payload;
      const syncId = 'mut_klas_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      // 1. Optimistic Local Commit (0 milidetik)
      let rec = this.state.klasemen.find(i => i.tanggal === tanggal && i.sakan === sakan);
      if (!rec) {
        rec = {
          id: Date.now(),
          tanggal,
          sakan,
          kebersihan: null,
          kedisiplinan: null,
          bahasa: null,
          totalPoin: 0
        };
        this.state.klasemen.push(rec);
      }

      if (kebersihan !== undefined) rec.kebersihan = kebersihan;
      if (kedisiplinan !== undefined) rec.kedisiplinan = kedisiplinan;
      if (bahasa !== undefined) rec.bahasa = bahasa;
      rec.totalPoin = (rec.kebersihan || 0) + (rec.kedisiplinan || 0) + (rec.bahasa || 0);
      rec._syncStatus = 'pending';
      rec._syncId = syncId;
      rec._syncError = null;

      safeStorageSet(STORAGE_KEYS.KLASEMEN, this.state.klasemen);

      // 2. Tambah ke antrean Outbox
      this._addOutbox('klasemen', 'save_klasemen', payload, syncId);
      this._setSyncStatus('loading', 'Menyimpan...');

      // 3. Picu drain di background tanpa memblokir
      this._drainOutbox();

      return { status: 'success', optimistic: true, syncId, local: true };
    }

    /**
     * Mutasi: Simpan poin klasemen massal (WhatsApp-Style Optimistic Bulk)
     */
    async saveKlasemenBulk(entries) {
      if (!Array.isArray(entries) || entries.length === 0) {
        return { status: 'error', message: 'Daftar entri kosong.' };
      }

      const syncId = 'mut_bulk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      // 1. Optimistic Local Commit untuk semua baris
      entries.forEach(item => {
        const { tanggal, sakan, kebersihan, kedisiplinan, bahasa } = item;
        let rec = this.state.klasemen.find(i => i.tanggal === tanggal && i.sakan === sakan);
        if (!rec) {
          rec = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            tanggal,
            sakan,
            kebersihan: null,
            kedisiplinan: null,
            bahasa: null,
            totalPoin: 0
          };
          this.state.klasemen.push(rec);
        }

        if (kebersihan !== undefined) rec.kebersihan = kebersihan;
        if (kedisiplinan !== undefined) rec.kedisiplinan = kedisiplinan;
        if (bahasa !== undefined) rec.bahasa = bahasa;
        rec.totalPoin = (rec.kebersihan || 0) + (rec.kedisiplinan || 0) + (rec.bahasa || 0);
        rec._syncStatus = 'pending';
        rec._syncId = syncId;
        rec._syncError = null;
      });

      safeStorageSet(STORAGE_KEYS.KLASEMEN, this.state.klasemen);

      // 2. Tambah ke antrean Outbox
      this._addOutbox('klasemen', 'save_klasemen_bulk', entries, syncId);
      this._setSyncStatus('loading', 'Menyimpan rekap massal...');

      // 3. Picu drain di background
      this._drainOutbox();

      return { status: 'success', optimistic: true, count: entries.length, syncId, local: true };
    }

    /**
     * Mutasi: Hapus poin klasemen
     */
    async deleteKlasemen(tanggal, sakan) {
      this.state.klasemen = this.state.klasemen.filter(i => !(i.tanggal === tanggal && i.sakan === sakan));
      safeStorageSet(STORAGE_KEYS.KLASEMEN, this.state.klasemen);

      const syncId = this._addOutbox('klasemen', 'delete_klasemen', { tanggal, sakan });
      this._drainOutbox();

      return { status: 'success', optimistic: true, syncId };
    }

    /**
     * Mutasi: Simpan jadwal / hasil skor turnamen bola (WhatsApp-Style Optimistic)
     */
    async saveMatch(matchObj) {
      const syncId = 'mut_liga_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      // 1. Optimistic Local Commit
      const idx = this.state.liga.findIndex(i => String(i.id) === String(matchObj.id));
      const entryToSave = {
        ...matchObj,
        _syncStatus: 'pending',
        _syncId: syncId,
        _syncError: null
      };

      if (idx > -1) {
        this.state.liga[idx] = { ...this.state.liga[idx], ...entryToSave };
      } else {
        this.state.liga.push(entryToSave);
      }

      safeStorageSet(STORAGE_KEYS.LIGA, this.state.liga);

      // 2. Outbox & background push
      this._addOutbox('liga', 'save_match', matchObj, syncId);
      this._setSyncStatus('loading', 'Menyimpan jadwal/skor...');
      this._drainOutbox();

      return { status: 'success', optimistic: true, syncId, local: true };
    }

    /**
     * Mutasi: Hapus pertandingan liga
     */
    async deleteMatch(id) {
      this.state.liga = this.state.liga.filter(i => String(i.id) !== String(id));
      safeStorageSet(STORAGE_KEYS.LIGA, this.state.liga);

      const syncId = this._addOutbox('liga', 'delete_match', { id });
      this._drainOutbox();

      return { status: 'success', optimistic: true, syncId };
    }

    /**
     * Mutasi: Simpan agenda event (WhatsApp-Style Optimistic)
     */
    async saveEvent(eventObj) {
      const syncId = 'mut_evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      // 1. Optimistic Local Commit
      const idx = this.state.event.findIndex(i => String(i.id) === String(eventObj.id));
      const entryToSave = {
        ...eventObj,
        _syncStatus: 'pending',
        _syncId: syncId,
        _syncError: null
      };

      if (idx > -1) {
        this.state.event[idx] = { ...this.state.event[idx], ...entryToSave };
      } else {
        this.state.event.push(entryToSave);
      }

      safeStorageSet(STORAGE_KEYS.EVENT, this.state.event);

      // 2. Outbox & background push
      this._addOutbox('event', 'save_event', eventObj, syncId);
      this._setSyncStatus('loading', 'Menyimpan agenda event...');
      this._drainOutbox();

      return { status: 'success', optimistic: true, syncId, local: true };
    }

    /**
     * Mutasi: Hapus agenda event
     */
    async deleteEvent(id) {
      this.state.event = this.state.event.filter(i => String(i.id) !== String(id));
      safeStorageSet(STORAGE_KEYS.EVENT, this.state.event);

      const syncId = this._addOutbox('event', 'delete_event', { id });
      this._drainOutbox();

      return { status: 'success', optimistic: true, syncId };
    }
  }

  return {
    STORAGE_KEYS,
    DataStore,
    HttpTransportAdapter,
    InMemoryTransportAdapter
  };
});
