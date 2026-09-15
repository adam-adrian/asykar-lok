import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

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
  { id: 'm-3', round: 'Semifinal', tanggal: '2026-09-14', waktu: '15:30 WIB', lokasi: 'Lapangan Utama', timA: 'QAZVIN', timB: 'NAISABUR', skorA: null, skorB: null, status: 'JADWAL' }
];

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--incognito',
    '--user-data-dir=/tmp/helium-beranda-' + Date.now(),
    '--remote-debugging-port=9222',
    '--window-size=1280,1200',
    'http://127.0.0.1:8899/'
  ]);

  let tabs = null;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      tabs = await res.json();
      if (tabs) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  try {
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

    await send('Runtime.evaluate', {
      expression: `
        new Promise(resolve => {
          const check = () => {
            if (window.store && typeof window.renderDashboard === 'function') resolve(true);
            else setTimeout(check, 100);
          };
          check();
        })
      `,
      awaitPromise: true
    });

    // Inject sample data into localStorage and trigger render
    const injectCode = `
      localStorage.setItem('lok-klasemen-v5', JSON.stringify(${JSON.stringify(sampleRecords)}));
      localStorage.setItem('lok-event-v5', JSON.stringify(${JSON.stringify(sampleEvents)}));
      localStorage.setItem('lok-liga-v5', JSON.stringify(${JSON.stringify(sampleMatches)}));
      window.store.state.klasemen = ${JSON.stringify(sampleRecords)};
      window.store.state.event = ${JSON.stringify(sampleEvents)};
      window.store.state.liga = ${JSON.stringify(sampleMatches)};
      window.renderDashboard();
      document.getElementById('dashKlasemenContent') ? document.getElementById('dashKlasemenContent').innerHTML.length : 0;
    `;

    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send('Runtime.evaluate', { expression: injectCode });
    console.log('Inject result:', evalRes);
    await new Promise(r => setTimeout(r, 700));

    // 1. Capture Desktop View
    const shotDesktop = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/desktop_beranda_refined.png`, Buffer.from(shotDesktop.data, 'base64'));
    fs.writeFileSync(`${ARTIFACT_DIR}/desktop_beranda_mission_control.png`, Buffer.from(shotDesktop.data, 'base64'));

    // 2. Capture Mobile View
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 1200,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 600));

    const shotMobile = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/mobile_beranda_refined.png`, Buffer.from(shotMobile.data, 'base64'));
    fs.writeFileSync(`${ARTIFACT_DIR}/mobile_beranda_mission_control.png`, Buffer.from(shotMobile.data, 'base64'));

    console.log('Screenshots desktop_beranda_mission_control.png & mobile_beranda_mission_control.png captured successfully!');
    ws.close();
  } finally {
    browser.kill();
  }
}

run().catch(console.error);
