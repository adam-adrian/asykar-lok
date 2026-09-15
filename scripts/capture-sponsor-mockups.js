import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--incognito',
    '--user-data-dir=/tmp/helium-sponsor-' + Date.now(),
    '--remote-debugging-port=9226',
    '--window-size=440,1400',
    'http://127.0.0.1:8899/docs/mockup/sponsor-banner-mockups.html'
  ]);

  let tabs = null;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9226/json');
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
        const handler = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.id === msgId) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 1250,
      deviceScaleFactor: 2,
      mobile: true
    });

    await new Promise(r => setTimeout(r, 1000));

    const shot = await send('Page.captureScreenshot', { format: 'png', quality: 90 });
    fs.writeFileSync(`${ARTIFACT_DIR}/sponsor_banner_mockups.png`, Buffer.from(shot.data, 'base64'));
    console.log('Saved sponsor_banner_mockups.png');

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    browser.kill();
  }
}

run();
