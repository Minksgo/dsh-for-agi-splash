#!/usr/bin/env node
/**
 * Build lib/client.js and preview/splash.html from src/.
 *
 * Sources of truth:
 *   src/scene/agi.html     the animated scene (self-contained page: SVG stage + vanilla JS)
 *   src/client.template.js the plugin shim (shadow root, skip, teardown)
 *   assets/agi-boot.mp3    the 9.9 s narration + sound design
 *
 * Two outputs:
 *   lib/client.js          shadow-root overlay with the SVG, the scene script and the audio inlined
 *   preview/splash.html    the same scene as a plain page, so it can be opened in a browser
 *                          (or served at /dsh-for-agi-splash/preview by lib/index.js)
 *
 * Deterministic: same inputs, byte-identical outputs. No network, no dependencies.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')

const page = read('src/scene/agi.html')
const template = read('src/client.template.js')
const audioBase64 = readFileSync(resolve(ROOT, 'assets/agi-boot.mp3')).toString('base64')

/** Slice one region out of the scene page, and fail loudly when the markers move. */
function slice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (start < 0 || end < 0 || end <= start) throw new Error('scene: ' + label + ' markers not found')
  return source.slice(start, end)
}

const svg = slice(page, '<svg id="stage"', '</svg>', 'svg').replace('id="stage"', 'id="agiScene"') + '</svg>'
const script = slice(page, '<script>', '</script>', 'script').slice('<script>'.length)

/* The scene script is written against a page: split it into its data/setup half, its
   build half and its render half, then rebind `$()`/`document.querySelector` to the
   shadow root's #boot so the same code runs inside the overlay. */
const NS = slice(script, 'const NS=', '  // ---------- corner brackets ----------', 'NS block')
const buildPart = slice(script, '  // ---------- corner brackets ----------', '  // ---------- render ----------', 'build block')
  .replace(/\$\(/g, 'q(')
  .replace(/\bdocument\.querySelector\b/g, 'q')
const renderPart = slice(script, '  // ---------- render ----------', '  const freeze=', 'render block')
  .replace(/\$\(/g, 'q(')
  .replace(/\bdocument\.querySelector\b/g, 'q')
  /* the page ran 10.2 s wide; the overlay retires at 9.9 s, so the last fades are pulled in */
  .replace('(t,9.2,10.2)', '(t,9.2,9.9)')
  .replace('(t,9.3,10.2)', '(t,9.2,9.9)')
  .replace('(t,9.5,10.3)', '(t,9.4,9.9)')
  .replace('(t,8.8,10.2)', '(t,9.0,9.9)')

const NSHead = NS.split('\n').filter((line) => !line.includes('const $=')).join('\n')

const playBoot = [
  '\t\t/* ===== AGI 开屏：五幕 DSH 启动链 + 中文旁白 ===== */',
  '\t\tfunction playBoot() {',
  "\t\t\tconst boot = stage.querySelector('#boot');",
  '\t\t\tif (boot === null) return 0;',
  '\t\t\tconst q = (s) => boot.querySelector(s);',
  NSHead,
  buildPart,
  renderPart,
  '\t\t\tconst SCENE_MS = 9900;',
  '\t\t\tconst t0 = performance.now();',
  '\t\t\tlet raf = 0;',
  '\t\t\tconst frame = (now) => {',
  '\t\t\t\tif (cancelled) return;',
  '\t\t\t\tconst t = (now - t0) / 1000;',
  '\t\t\t\trender(t);',
  '\t\t\t\tif (t < SCENE_MS / 1000) raf = requestAnimationFrame(frame);',
  '\t\t\t};',
  '\t\t\trender(0);',
  '\t\t\traf = requestAnimationFrame(frame);',
  "\t\t\tconst au = q('#agiAudio');",
  '\t\t\tif (au !== null) {',
  '\t\t\t\tau.src = AUDIO_MP3;',
  '\t\t\t\tau.volume = 0.9;',
  '\t\t\t\tconst kick = () => {',
  '\t\t\t\t\ttry {',
  '\t\t\t\t\t\tconst played = au.play();',
  '\t\t\t\t\t\tif (played && played.catch) played.catch(() => { au.muted = true; au.play().catch(() => {}) });',
  '\t\t\t\t\t} catch (error) {',
  '\t\t\t\t\t\tau.muted = true;',
  '\t\t\t\t\t\ttry { au.play() } catch (ignored) {}',
  '\t\t\t\t\t}',
  '\t\t\t\t};',
  '\t\t\t\tkick();',
  '\t\t\t\tlater(kick, 120);',
  '\t\t\t\tlater(kick, 800);',
  '\t\t\t}',
  '\t\t\treturn SCENE_MS;',
  '\t\t}',
  '',
].join('\n')

const assets = [
  '\t\tconst BOOT_SVG = ' + JSON.stringify(svg) + ';',
  '\t\tconst AUDIO_MP3 = "data:audio/mpeg;base64,' + audioBase64 + '";',
].join('\n')

const client = template
  .replace('/*__ASSETS__*/', assets)
  .replace('/*__PLAY_BOOT__*/', playBoot)

writeFileSync(resolve(ROOT, 'lib/client.js'), client)
console.log('lib/client.js', client.length, 'bytes')

/* ---------- preview page ---------- */
const hint = `
<div id="hint" style="position:fixed;left:0;right:0;bottom:14px;text-align:center;
  font:12px/1.6 'PingFang SC',sans-serif;color:#5fd6e8;letter-spacing:.16em;opacity:.7;
  pointer-events:none;z-index:99">点击任意处从头重播 · 地址栏加 ?t=4.9 冻结在某一秒</div>
<script>
(function () {
  var frozen = new URLSearchParams(location.search).get('t');
  if (frozen !== null) {
    var hintEl = document.getElementById('hint');
    if (hintEl) hintEl.style.display = 'none';
    return;
  }
  var audio = document.getElementById('au');
  function playFromStart() {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0.9;
      audio.play().catch(function () {});
    } catch (error) {}
    var t0 = performance.now();
    var loop = function (now) {
      var t = (now - t0) / 1000;
      window.__render(t);
      if (t < 9.9) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  window.addEventListener('pointerdown', playFromStart);
  window.addEventListener('keydown', playFromStart);
  window.setTimeout(playFromStart, 80);
})();
</script>
`

const preview = page
  .replace('src="audio/agi-boot.mp3"', 'src="data:audio/mpeg;base64,' + audioBase64 + '"')
  .replace('</body>', hint + '</body>')
writeFileSync(resolve(ROOT, 'preview/splash.html'), preview)
console.log('preview/splash.html', preview.length, 'bytes')
