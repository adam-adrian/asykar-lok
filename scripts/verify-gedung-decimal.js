import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ARTIFACT_DIR = '/home/neikami/.gemini/antigravity-cli/brain/d5f78be6-33d9-4793-b797-384305d679a7';

async function run() {
  const browser = spawn('helium-browser', [
    '--headless',
    '--disable-gpu',
    '--incognito',
    '--user-data-dir=/tmp/helium-verify-' + Date.now(),
    '--remote-debugging-port=9229',
    '--window-size=400,1000',
    'http://127.0.0.1:8899/'
  ]);

  let tabs = null;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9229/json');
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

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await new Promise(r => setTimeout(r, 1200));

    // Test 1: Cek isi dari #pubSakanPills di browser
    const pillsInfo = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const container = document.getElementById('pubSakanPills');
          return {
            html: container ? container.innerHTML : '',
            pillCount: container ? container.querySelectorAll('.pub-pill').length : 0,
            texts: container ? Array.from(container.querySelectorAll('.pub-pill span:last-child')).map(s => s.textContent) : []
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Pills Info:', pillsInfo.result.value);

    // Test 2: Scroll ke #sakanSection dan capture screenshot
    await send('Runtime.evaluate', {
      expression: `document.getElementById('sakanSection').scrollIntoView();`
    });
    await new Promise(r => setTimeout(r, 600));

    const shotFooter = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/footer_gedung_pills.png`, Buffer.from(shotFooter.data, 'base64'));
    console.log('Saved footer_gedung_pills.png');

    // Test 3: Test modal klasemen input decimal & validation
    const testDecimal = await send('Runtime.evaluate', {
      expression: `
        (() => {
          // Buka modal
          window.openKlasemenModal();
          const inpKeb = document.getElementById('fKebersihan');
          const inpKed = document.getElementById('fKedisiplinan');
          const inpBah = document.getElementById('fBahasa');

          // Masukkan nilai koma & titik
          inpKeb.value = '85,5';
          window.liveValidatePoin(inpKeb, 'hintKebersihan');

          inpKed.value = '92.25';
          window.liveValidatePoin(inpKed, 'hintKedisiplinan');

          inpBah.value = '80';
          window.liveValidatePoin(inpBah, 'hintBahasa');

          // Cek validasi engine
          const valResult = StandingsEngine.validateEntry({
            tanggal: '2026-09-15',
            sakan: 'QAZVIN ATAS',
            kebersihan: inpKeb.value,
            kedisiplinan: inpKed.value,
            bahasa: inpBah.value
          });

          return {
            inpKebValue: inpKeb.value,
            inpKedValue: inpKed.value,
            valResult: valResult
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Decimal Test Result:', testDecimal.result.value);

    // Capture modal dengan nilai desimal
    await new Promise(r => setTimeout(r, 400));
    const shotModal = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${ARTIFACT_DIR}/modal_decimal_input.png`, Buffer.from(shotModal.data, 'base64'));
    console.log('Saved modal_decimal_input.png');

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    browser.kill();
  }
}

run();
