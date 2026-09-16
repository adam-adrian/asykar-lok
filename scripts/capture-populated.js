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

    // Inject sample data into localStorage and trigger render
    const injectCode = `
      localStorage.setItem('lok-klasemen-v5', JSON.stringify(${JSON.stringify(sampleRecords)}));
      localStorage.setItem('lok-event-v5', JSON.stringify(${JSON.stringify(sampleEvents)}));
      localStorage.setItem('lok-liga-v5', JSON.stringify(${JSON.stringify(sampleMatches)}));
      store.state.klasemen = ${JSON.stringify(sampleRecords)};
      store.state.event = ${JSON.stringify(sampleEvents)};
      store.state.liga = ${JSON.stringify(sampleMatches)};
      renderDashboard();
    `;

    await send('Runtime.evaluate', { expression: injectCode });
    await new Promise(r => setTimeout(r, 500));

    // 1. Desktop Klasemen
    await send('Runtime.evaluate', { expression: `switchView('klasemen')` });
    await new Promise(r => setTimeout(r, 400));
    const shotKlasemen = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/desktop_phase3_klasemen.png', Buffer.from(shotKlasemen.data, 'base64'));

    // 2. Desktop Liga Jadwal
    await send('Runtime.evaluate', { expression: `switchView('liga'); switchLigaTab('jadwal');` });
    await new Promise(r => setTimeout(r, 400));
    const shotLigaJadwal = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/desktop_phase3_liga_jadwal.png', Buffer.from(shotLigaJadwal.data, 'base64'));

    // 3. Desktop Liga Hasil & Bracket
    await send('Runtime.evaluate', { expression: `switchLigaTab('hasil');` });
    await new Promise(r => setTimeout(r, 400));
    const shotLigaHasil = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/desktop_phase3_liga_hasil.png', Buffer.from(shotLigaHasil.data, 'base64'));

    // 4. Desktop Event
    await send('Runtime.evaluate', { expression: `switchView('event');` });
    await new Promise(r => setTimeout(r, 400));
    const shotEvent = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/desktop_phase3_event.png', Buffer.from(shotEvent.data, 'base64'));

    // --- MOBILE SCREENSHOTS (390x844) ---
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // Mobile Klasemen
    await send('Runtime.evaluate', { expression: `switchView('klasemen');` });
    await new Promise(r => setTimeout(r, 400));
    const shotMobileKlasemen = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/mobile_phase3_klasemen.png', Buffer.from(shotMobileKlasemen.data, 'base64'));

    // Mobile Liga Jadwal
    await send('Runtime.evaluate', { expression: `switchView('liga'); switchLigaTab('jadwal');` });
    await new Promise(r => setTimeout(r, 400));
    const shotMobileLigaJadwal = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/mobile_phase3_liga_jadwal.png', Buffer.from(shotMobileLigaJadwal.data, 'base64'));

    // Mobile Liga Hasil & Bracket
    await send('Runtime.evaluate', { expression: `switchLigaTab('hasil');` });
    await new Promise(r => setTimeout(r, 400));
    const shotMobileLigaHasil = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/mobile_phase3_liga_hasil.png', Buffer.from(shotMobileLigaHasil.data, 'base64'));

    // Mobile Event
    await send('Runtime.evaluate', { expression: `switchView('event');` });
    await new Promise(r => setTimeout(r, 400));
    const shotMobileEvent = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/mobile_phase3_event.png', Buffer.from(shotMobileEvent.data, 'base64'));

    console.log('All Phase 3 desktop & mobile baseline views captured successfully!');
    ws.close();
  } finally {
    browser.kill();
  }
}

run().catch(console.error);
