import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--incognito',
    '--user-data-dir=/tmp/helium-layout-mockup-' + Date.now(),
    '--remote-debugging-port=9222',
    '--window-size=1280,1280',
    'http://127.0.0.1:8899/docs/mockup/beranda-layout.html'
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

  // Capture Opsi A
  await send('Runtime.evaluate', { expression: `showOption('opta')` });
  await new Promise(r => setTimeout(r, 400));
  const shotA = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/layout_mockup_option_a.png`, Buffer.from(shotA.data, 'base64'));

  // Capture Opsi B
  await send('Runtime.evaluate', { expression: `showOption('optb')` });
  await new Promise(r => setTimeout(r, 400));
  const shotB = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/layout_mockup_option_b.png`, Buffer.from(shotB.data, 'base64'));

  // Capture Opsi C
  await send('Runtime.evaluate', { expression: `showOption('optc')` });
  await new Promise(r => setTimeout(r, 400));
  const shotC = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/layout_mockup_option_c.png`, Buffer.from(shotC.data, 'base64'));

  // Capture Opsi A Mobile (390x1600)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 1600,
    deviceScaleFactor: 2,
    mobile: true
  });
  await send('Runtime.evaluate', { expression: `showOption('opta')` });
  await new Promise(r => setTimeout(r, 500));
  const shotAMobile = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/layout_mockup_option_a_mobile.png`, Buffer.from(shotAMobile.data, 'base64'));

  console.log('Successfully captured layout mockup screenshots including Option A Mobile!');
  ws.close();
  browser.kill();
}

run().catch(console.error);
