
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = process.argv[2] || path.join(root, 'frames-720');
const FPS = 30, DUR = 120, TOTAL = parseInt(process.env.FRAMES || String(FPS * DUR), 10);
const W = 1280, H = 720;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const page = 'file://' + encodeURI(path.join(root, 'src/scene/agi120.html')) + '?t=0';

await mkdir(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=/tmp/chrome-agi120', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--window-size=' + W + ',' + H,
  page,
], { stdio: ['ignore', 'ignore', 'ignore'] });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let target = null;
for (let k = 0; k < 120; k++) {
  await sleep(250);
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
    target = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
    if (target) break;
  } catch {}
}
if (!target) { chrome.kill(); throw new Error('no CDP target'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const waiting = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
};
const call = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
});

await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await call('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });
await sleep(600);

const t0 = Date.now();
for (let i = 0; i < TOTAL; i++) {
  const t = i / FPS;
  await call('Runtime.evaluate', { expression: 'window.__render(' + t.toFixed(4) + ')' });
  const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(OUT, String(i).padStart(5, '0') + '.png'), Buffer.from(shot.data, 'base64'));
  if (i % 150 === 0) {
    const dt = (Date.now() - t0) / 1000;
    console.log(i + '/' + TOTAL + '  ' + dt.toFixed(0) + 's  ' + (dt / (i || 1) * 1000).toFixed(0) + ' ms/frame');
  }
}
console.log('DONE ' + TOTAL + ' frames in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
ws.close(); chrome.kill();
