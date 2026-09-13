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
      store.state.klasemen = ${JSON.stringify(sampleRecords)};
      store.state.event = ${JSON.stringify(sampleEvents)};
      renderDashboard();
    `;

    await send('Runtime.evaluate', { expression: injectCode });
    await new Promise(r => setTimeout(r, 600));

    // Desktop screenshot
    const shotDesktop = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/desktop_phase2_full_data.png', Buffer.from(shotDesktop.data, 'base64'));
    console.log('Saved desktop_phase2_full_data.png');

    // Mobile screenshot
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 400));
    const shotMobile = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7/mobile_phase2_full_data.png', Buffer.from(shotMobile.data, 'base64'));
    console.log('Saved mobile_phase2_full_data.png');

    ws.close();
  } finally {
    browser.kill();
  }
}

run().catch(console.error);
