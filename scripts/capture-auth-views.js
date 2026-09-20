import { spawn } from 'node:child_process';
import fs from 'node:fs';

const sampleRecords = [
  { tanggal: '2026-09-10', sakan: 'QAZVIN ATAS', kebersihan: 96, kedisiplinan: 92, bahasa: 88 },
  { tanggal: '2026-09-10', sakan: 'NAISABUR', kebersihan: 90, kedisiplinan: 88, bahasa: 84 },
  { tanggal: '2026-09-10', sakan: 'BUKHARA', kebersihan: 85, kedisiplinan: 82, bahasa: 80 },
  { tanggal: '2026-09-11', sakan: 'QAZVIN ATAS', kebersihan: 98, kedisiplinan: 94, bahasa: 90 },
  { tanggal: '2026-09-11', sakan: 'NAISABUR', kebersihan: 92, kedisiplinan: 86, bahasa: 85 },
  { tanggal: '2026-09-11', sakan: 'BUKHARA', kebersihan: 88, kedisiplinan: 80, bahasa: 78 }
];

const sampleEvents = [
  {
    id: 'evt-1',
    tanggal: '2026-09-14',
    waktu: '16:00 WIB',
    kategori: 'Disiplin',
    judul: 'Inspeksi Akbar Kebersihan Kamar Santri',
    lokasi: 'Seluruh Kompleks Sakan'
  },
  {
    id: 'evt-2',
    tanggal: '2026-09-16',
    waktu: '20:00 WIB',
    kategori: 'Bahasa',
    judul: 'Muwajjahah Lughawiyyah Santri Baru',
    lokasi: 'Masjid Jami\''
  }
];

const sampleMatches = [
  { id: 'm-1', round: 'Penyisihan', tanggal: '2026-09-12', waktu: '15:30 WIB', lokasi: 'Lapangan Timur', timA: 'QAZVIN', timB: 'TIRMIDZ', skorA: 3, skorB: 1, status: 'SELESAI' },
  { id: 'm-2', round: 'Penyisihan', tanggal: '2026-09-12', waktu: '16:30 WIB', lokasi: 'Lapangan Barat', timA: 'NAISABUR', timB: 'BUKHARA', skorA: 2, skorB: 0, status: 'SELESAI' },
  { id: 'm-3', round: 'Semifinal', tanggal: '2026-09-14', waktu: '15:30 WIB', lokasi: 'Lapangan Utama', timA: 'QAZVIN', timB: 'NAISABUR', skorA: 2, skorB: 1, status: 'SELESAI' },
  { id: 'm-4', round: 'Final', tanggal: '2026-09-16', waktu: '15:30 WIB', lokasi: 'Lapangan Utama', timA: 'QAZVIN', timB: 'SIJISTAN', skorA: 1, skorB: 0, status: 'SELESAI' },
  { id: 'm-5', round: 'Penyisihan', tanggal: '2026-09-18', waktu: '16:00 WIB', lokasi: 'Lapangan Timur', timA: 'HAMADAN', timB: 'ZARAGOZA', skorA: null, skorB: null, status: 'JADWAL' }
];

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--window-size=1280,960',
    'http://127.0.0.1:8899/'
  ]);

  await new Promise(r => setTimeout(r, 1200));

  try {
    const res = await fetch('http://127.0.0.1:9222/json');
    const tabs = await res.json();
    const tab = tabs.find(t => t.type === 'page');
    if (!tab) throw new Error('No page tab found');

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const msgId = id++;
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === msgId) {
            ws.removeEventListener('message', handler);
            resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    // Wait until app.js functions are ready
    for (let i = 0; i < 50; i++) {
      const check = await send('Runtime.evaluate', { expression: 'typeof switchView === "function"' });
      if (check?.result?.value === true) {
        console.log(`app.js loaded at iteration ${i}`);
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Base data injection
    const injectDataCode = `
      localStorage.setItem('lok-klasemen-v5', JSON.stringify(${JSON.stringify(sampleRecords)}));
      localStorage.setItem('lok-event-v5', JSON.stringify(${JSON.stringify(sampleEvents)}));
      localStorage.setItem('lok-liga-v5', JSON.stringify(${JSON.stringify(sampleMatches)}));
      store.state.klasemen = ${JSON.stringify(sampleRecords)};
      store.state.event = ${JSON.stringify(sampleEvents)};
      store.state.liga = ${JSON.stringify(sampleMatches)};
    `;
    await send('Runtime.evaluate', { expression: injectDataCode });

    const setAuth = async (role) => {
      const code = role === 'admin' ? `
        currentUser = "admin";
        currentRole = "admin_utama";
        currentLabel = "Admin Utama";
        currentAuthToken = "mock-token-admin";
        saveSession();
        applyUserSessionUI();
        if (currentView === "klasemen") renderKlasemen();
        else if (currentView === "liga") renderligaMenu();
      ` : `
        currentUser = "Tamu";
        currentRole = "tamu";
        currentLabel = "Tamu";
        currentAuthToken = "";
        clearSession();
        applyUserSessionUI();
        if (currentView === "klasemen") renderKlasemen();
        else if (currentView === "liga") renderligaMenu();
      `;
      await send('Runtime.evaluate', { expression: code });
      await new Promise(r => setTimeout(r, 300));
    };

    const captureShot = async (filename) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`${ARTIFACT_DIR}/${filename}`, Buffer.from(shot.data, 'base64'));
      console.log('Saved:', filename);
    };

    // ==========================================
    // 1. MOBILE VIEW (390x844)
    // ==========================================
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // --- Klasemen: Tamu vs Admin ---
    await send('Runtime.evaluate', { expression: `switchView('klasemen');` });
    await setAuth('tamu');
    await captureShot('mobile_klasemen_tamu.png');

    // Scroll slightly down in table to see rows & actions
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 320);` });
    await new Promise(r => setTimeout(r, 200));
    await captureShot('mobile_klasemen_tamu_table.png');

    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0);` });
    await setAuth('admin');
    await captureShot('mobile_klasemen_admin.png');

    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 320);` });
    await new Promise(r => setTimeout(r, 200));
    await captureShot('mobile_klasemen_admin_table.png');

    // --- Liga Jadwal: Tamu vs Admin ---
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0); switchView('liga'); switchLigaTab('jadwal');` });
    await setAuth('tamu');
    await captureShot('mobile_liga_jadwal_tamu.png');

    await setAuth('admin');
    await captureShot('mobile_liga_jadwal_admin.png');

    // --- Liga Hasil & Bracket: Tamu vs Admin ---
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0); switchLigaTab('hasil');` });
    await setAuth('tamu');
    await captureShot('mobile_liga_hasil_tamu.png');

    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 450);` });
    await new Promise(r => setTimeout(r, 200));
    await captureShot('mobile_liga_hasil_tamu_bracket.png');

    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0);` });
    await setAuth('admin');
    await captureShot('mobile_liga_hasil_admin.png');

    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 450);` });
    await new Promise(r => setTimeout(r, 200));
    await captureShot('mobile_liga_hasil_admin_bracket.png');

    // ==========================================
    // 2. DESKTOP VIEW (1280x960)
    // ==========================================
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false
    });

    // --- Klasemen: Tamu vs Admin ---
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0); switchView('klasemen');` });
    await setAuth('tamu');
    await captureShot('desktop_klasemen_tamu.png');

    await setAuth('admin');
    await captureShot('desktop_klasemen_admin.png');

    // --- Liga Jadwal: Tamu vs Admin ---
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0); switchView('liga'); switchLigaTab('jadwal');` });
    await setAuth('tamu');
    await captureShot('desktop_liga_jadwal_tamu.png');

    await setAuth('admin');
    await captureShot('desktop_liga_jadwal_admin.png');

    // --- Liga Hasil: Tamu vs Admin ---
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0); switchLigaTab('hasil');` });
    await setAuth('tamu');
    await captureShot('desktop_liga_hasil_tamu.png');

    await setAuth('admin');
    await captureShot('desktop_liga_hasil_admin.png');

    console.log('Finished capturing all accurate comparisons!');
    ws.close();
  } finally {
    browser.kill();
  }
}

run().catch(console.error);
