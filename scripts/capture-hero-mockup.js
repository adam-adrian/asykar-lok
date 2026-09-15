import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--incognito',
    '--user-data-dir=/tmp/helium-hero-mockup-' + Date.now(),
    '--remote-debugging-port=9222',
    '--window-size=1280,1050',
    'http://127.0.0.1:8899/docs/mockup/beranda-hero.html'
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

  // Capture Opsi 1
  await send('Runtime.evaluate', { expression: `showOption('opt1')` });
  await new Promise(r => setTimeout(r, 400));
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/hero_mockup_option_1.png`, Buffer.from(shot1.data, 'base64'));

  // Capture Opsi 2
  await send('Runtime.evaluate', { expression: `showOption('opt2')` });
  await new Promise(r => setTimeout(r, 400));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/hero_mockup_option_2.png`, Buffer.from(shot2.data, 'base64'));

  // Capture Opsi 3
  await send('Runtime.evaluate', { expression: `showOption('opt3')` });
  await new Promise(r => setTimeout(r, 400));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${ARTIFACT_DIR}/hero_mockup_option_3.png`, Buffer.from(shot3.data, 'base64'));

  console.log('All 3 hero mockup screenshots captured successfully!');
  ws.close();
  browser.kill();
}

run().catch(console.error);
