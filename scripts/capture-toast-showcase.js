import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--incognito',
    '--user-data-dir=/tmp/helium-toast-showcase-' + Date.now(),
    '--remote-debugging-port=9222',
    '--window-size=1280,800',
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

  const tab = tabs.find(t => t.type === 'page');
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

  await new Promise(r => setTimeout(r, 1200));

  // Wait for showToast to be defined on window
  await send('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      const check = () => {
        if (typeof window.showToast === 'function') resolve(true);
        else setTimeout(check, 100);
      };
      check();
    })`,
    awaitPromise: true
  });

  // Close any modal veil if open
  await send('Runtime.evaluate', { expression: `if (typeof closeAllModals === 'function') closeAllModals()` });
  await new Promise(r => setTimeout(r, 400));

  // 1. Desktop: Success Toast
  await send('Runtime.evaluate', { expression: `window.showToast("Data klasemen berhasil disinkronkan ke cloud!", "success")` });
  await new Promise(r => setTimeout(r, 400));
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/toast_desktop_success.png`, Buffer.from(shot1.data, 'base64'));

  // 2. Mobile: Error Toast (Compare with the old potato blob)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await send('Runtime.evaluate', { expression: `window.showToast("Gagal sinkronisasi data ke server. Menggunakan data cadangan lokal.", "err")` });
  await new Promise(r => setTimeout(r, 400));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/toast_mobile_error.png`, Buffer.from(shot2.data, 'base64'));

  // 3. Mobile: Info / Syncing Toast
  await send('Runtime.evaluate', { expression: `window.showToast("Sedang menyinkronkan data sakan terbaru...", "info")` });
  await new Promise(r => setTimeout(r, 400));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/toast_mobile_info.png`, Buffer.from(shot3.data, 'base64'));

  console.log('Toast screenshots captured successfully!');
  ws.close();
  browser.kill();
}

run().catch(console.error);
