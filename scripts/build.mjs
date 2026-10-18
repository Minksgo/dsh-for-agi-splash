#!/usr/bin/env node
/**
 * Build lib/client.js, preview/splash.html and preview/splash-30.html from src/.
 *
 * Sources of truth:
 *   src/scene/agi.html     9.9 s 精简版（五幕 DSH 启动链）
 *   src/scene/agi30.html   30 s 剧场版（冷启动 → 自检 → 认知网络 → 工具桥接 → 装配 → 就位 → 交棒）
 *   src/scene/agi120.html  120 s 电影版（八幕：冷启动 → 自检 → 认知网络 → 世界模型 → 工具桥接 → 上下文装配 → 推理链 → 就位）
 *   src/client.template.js the plugin shim (shadow root, 选版, skip, teardown)
 *   assets/agi-boot.mp3    9.9 s narration + sound design
 *   assets/agi-boot-30.mp3 30 s narration + sound design（scripts/build-audio-30.mjs 生成）
 *   assets/agi-boot-120.mp3 120 s narration + sound design（scripts/build-audio-120.mjs 生成）
 *
 * Outputs:
 *   lib/client.js          shadow-root overlay with both scenes and both audio tracks inlined
 *   preview/splash.html    9.9 s scene as a plain page
 *   preview/splash-30.html 30 s scene as a plain page
 *   preview/splash-120.html 120 s scene as a plain page
 *
 * Deterministic: same inputs, byte-identical outputs. No network, no dependencies.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')

/** Slice one region out of a scene page, and fail loudly when the markers move. */
function slice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (start < 0 || end < 0 || end <= start) throw new Error('scene: ' + label + ' markers not found')
  return source.slice(start, end)
}

const REBIND = [
  [/\$\(/g, 'q('],
  [/\bdocument\.querySelector\b/g, 'q'],
]

/** Compile one scene page into the pieces playBoot() needs. */
function compileScene(file, svgId, cutoff) {
  const page = read(file)
  const svg = slice(page, '<svg id="stage"', '</svg>', 'svg').replace('id="stage"', 'id="' + svgId + '"') + '</svg>'
  const script = slice(page, '<script>', '</script>', 'script').slice('<script>'.length)
  const NS = slice(script, 'const NS=', '  // ---------- corner brackets ----------', 'NS block')
  const buildPart = slice(script, '  // ---------- corner brackets ----------', '  // ---------- render ----------', 'build block')
  let renderPart = slice(script, '  // ---------- render ----------', '  const freeze=', 'render block')
  const rebound = (s) => REBIND.reduce((acc, [re, to]) => acc.replace(re, to), s)
  return {
    page,
    svg,
    NS,
    buildPart: rebound(buildPart),
    renderPart: (cutoff || []).reduce((acc, [from, to]) => acc.split(from).join(to), rebound(renderPart)),
  }
}

const short = compileScene('src/scene/agi.html', 'agiScene', [
  /* the page ran 10.2 s wide; the overlay retires at 9.9 s, so the last fades are pulled in */
  ['(t,9.2,10.2)', '(t,9.2,9.9)'],
  ['(t,9.3,10.2)', '(t,9.2,9.9)'],
  ['(t,9.5,10.3)', '(t,9.4,9.9)'],
  ['(t,8.8,10.2)', '(t,9.0,9.9)'],
])
const long = compileScene('src/scene/agi30.html', 'agiScene30', [])
const cinema = compileScene('src/scene/agi120.html', 'agiScene120', [])

const audioShort = readFileSync(resolve(ROOT, 'assets/agi-boot.mp3')).toString('base64')
const audioLong = readFileSync(resolve(ROOT, 'assets/agi-boot-30.mp3')).toString('base64')
const audioCinema = readFileSync(resolve(ROOT, 'assets/agi-boot-120.mp3')).toString('base64')
const version = JSON.parse(read('package.json')).version

const NSHead = (ns) => ns.split('\n').filter((line) => !line.includes('const $=')).join('\n')

function sceneFn(name, compiled, ms) {
  return [
    '\t\tfunction ' + name + '(root) {',
    '\t\t\tconst q = (s) => root.querySelector(s);',
    NSHead(compiled.NS),
    compiled.buildPart,
    compiled.renderPart,
    '\t\t\trender(0)',
    '\t\t\tconst SCENE_MS = ' + ms + ';',
    '\t\t\tconst t0 = performance.now();',
    '\t\t\tlet raf = 0;',
    '\t\t\tconst frame = (now) => {',
    '\t\t\t\tif (cancelled) return;',
    '\t\t\t\tconst t = (now - t0) / 1000;',
    '\t\t\t\trender(t);',
    '\t\t\t\tif (t < SCENE_MS / 1000) raf = requestAnimationFrame(frame);',
    '\t\t\t};',
    '\t\t\traf = requestAnimationFrame(frame);',
    '\t\t\treturn SCENE_MS;',
    '\t\t}',
    '',
  ].join('\n')
}

const playBoot = [
  '\t\t/* ===== 开屏：精简 9.9 s / 剧场 30 s / 电影 120 s，三套场景各自独立时钟 ===== */',
  sceneFn('bootShort', short, 9900),
  sceneFn('bootLong', long, 30000),
  sceneFn('bootCinema', cinema, 120000),
  '\t\tfunction playBoot(cut) {',
  "\t\t\tconst boot = stage.querySelector('#boot');",
  '\t\t\tif (boot === null) return 0;',
  "\t\t\tconst long = cut === 'long';",
  "\t\t\tconst root = boot.querySelector(cut === 'cinema' ? '#cutCinema' : long ? '#cutLong' : '#cutShort');",
  '\t\t\tif (root === null) return 0;',
  "\t\t\troot.classList.add('on');",
  "\t\t\tconst total = cut === 'cinema' ? bootCinema(root) : long ? bootLong(root) : bootShort(root);",
  "\t\t\tconst au = stage.querySelector('#agiAudio');",
  '\t\t\tif (au !== null) {',
  "\t\t\tau.src = cut === 'cinema' ? AUDIO_MP3_120 : long ? AUDIO_MP3_30 : AUDIO_MP3;",
  '\t\t\tau.volume = (typeof globalThis.__agiSplashVolume === "function") ? globalThis.__agiSplashVolume() : 0.9;',
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
  '\t\t\treturn total;',
  '\t\t}',
  '',
].join('\n')

const assets = [
  '\t\tconst BOOT_SVG = ' + JSON.stringify('<div id="cutShort" class="agi-cut">' + short.svg + '</div>' + '<div id="cutLong" class="agi-cut">' + long.svg + '</div>' + '<div id="cutCinema" class="agi-cut">' + cinema.svg + '</div>') + ';',
  '\t\tconst AUDIO_MP3 = "data:audio/mpeg;base64,' + audioShort + '";',
  '\t\tconst AUDIO_MP3_30 = "data:audio/mpeg;base64,' + audioLong + '";',
  '\t\tconst AUDIO_MP3_120 = "data:audio/mpeg;base64,' + audioCinema + '";',
  '\t\tconst PLUGIN_VERSION = ' + JSON.stringify(version) + ';',
].join('\n')

const client = read('src/client.template.js').replace('/*__ASSETS__*/', assets).replace('/*__PLAY_BOOT__*/', playBoot)
writeFileSync(resolve(ROOT, 'lib/client.js'), client)
console.log('lib/client.js', client.length, 'bytes')

/* ---------- preview pages ---------- */
function previewFor(compiled, audioBase64, seconds, extraHint) {
  const hint = [
    '',
    '<div id="hint" style="position:fixed;left:0;right:0;bottom:14px;text-align:center;',
    "  font:12px/1.6 'PingFang SC',sans-serif;color:#5fd6e8;letter-spacing:.16em;opacity:.7;",
    '  pointer-events:none;z-index:99">' + extraHint + '</div>',
    '<scr' + 'ipt>',
    '(function () {',
    '  var frozen = new URLSearchParams(location.search).get("t");',
    '  if (frozen !== null) {',
    "    var hintEl = document.getElementById('hint');",
    '    if (hintEl) hintEl.style.display = "none";',
    '    return;',
    '  }',
    "  var audio = document.getElementById('au');",
    '  function playFromStart() {',
    '    try {',
    '      audio.pause();',
    '      audio.currentTime = 0;',
    '      audio.volume = 0.9;',
    '      audio.play().catch(function () {});',
    '    } catch (error) {}',
    '    var t0 = performance.now();',
    '    var loop = function (now) {',
    '      var t = (now - t0) / 1000;',
    '      window.__render(t);',
    "      if (t < " + seconds + ') requestAnimationFrame(loop);',
    '    };',
    '    requestAnimationFrame(loop);',
    '  }',
    "  window.addEventListener('pointerdown', playFromStart);",
    "  window.addEventListener('keydown', playFromStart);",
    '  window.setTimeout(playFromStart, 80);',
    '})();',
    '</scr' + 'ipt>',
    '',
  ].join('\n')
  return compiled.page
    .replace(/src="audio\/[^"]+"/, 'src="data:audio/mpeg;base64,' + audioBase64 + '"')
    .replace('</body>', hint + '</body>')
}
writeFileSync(
  resolve(ROOT, 'preview/splash.html'),
  previewFor(short, audioShort, '9.9', '点击任意处从头重播 · 地址栏加 ?t=4.9 冻结在某一秒'),
)
console.log('preview/splash.html written')
writeFileSync(
  resolve(ROOT, 'preview/splash-30.html'),
  previewFor(long, audioLong, '30', '点击任意处从头重播 · 地址栏加 ?t=12 冻结在某一秒'),
)
console.log('preview/splash-30.html written')
writeFileSync(
  resolve(ROOT, 'preview/splash-120.html'),
  previewFor(cinema, audioCinema, '120', '点击任意处从头重播 · 地址栏加 ?t=61 冻结在某一秒'),
)
console.log('preview/splash-120.html written')
