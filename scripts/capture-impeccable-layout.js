import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--incognito',
    '--user-data-dir=/tmp/helium-impeccable-' + Date.now(),
    '--remote-debugging-port=9222',
    '--window-size=1280,1200',
    'http://127.0.0.1:8899/docs/mockup/beranda-layout.html?t=' + Date.now()
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

  // 1. Capture Desktop (1280px viewport)
  await send('Runtime.evaluate', { expression: `switchMode('desktop')` });
  await new Promise(r => setTimeout(r, 400));
  const shotDesktop = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/layout_impeccable_desktop.png`, Buffer.from(shotDesktop.data, 'base64'));

  // 2. Capture Mobile (Emulate 390x1400 viewport)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 1400,
    deviceScaleFactor: 2,
    mobile: true
  });
  await send('Runtime.evaluate', { expression: `switchMode('mobile')` });
  await new Promise(r => setTimeout(r, 500));
  const shotMobile = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/layout_impeccable_mobile.png`, Buffer.from(shotMobile.data, 'base64'));

  console.log('Successfully captured Impeccable Desktop and Mobile screenshots!');
  ws.close();
  browser.kill();
}

run().catch(console.error);
