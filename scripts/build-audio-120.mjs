#!/usr/bin/env node
/**
 * 120 秒电影版音轨：纯 Node 合成音乐床 + macOS say 旁白，ffmpeg 混音。
 *
 * 输出：assets/agi-boot-120.mp3（120 s，44.1 kHz 立体声）
 * 中间产物：assets/build/*.wav（不入库）
 *
 * 时间轴与 src/scene/agi120.html 严格对齐：
 *   0–12      冷启动（黑场、低频呼吸、三次深击、继电器）
 *   12–30     内核自检（扫描、滴答、心跳、插件装载、异常蜂鸣→校正）
 *   29.3–48   认知网络（A 小调琶音、宽垫）
 *   47.3–65.6 世界模型（Am–F–C–G 四段和声、球体微光脉冲）
 *   65.6–81.8 工具桥接（金属咬合、10 次工具 ping、铜线脉冲）
 *   81.8–99.4 上下文装配（加速 riser、螺旋 whoosh）
 *   99.4–100  静音蓄力
 *   100–108.34 推理链（心跳 + 逼近型滴答 + 张力音）
 *   108.34–118 冲冲击 + 五音和弦（AGI 就位）
 *   118–120    交棒 + 尾声
 */
import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'assets/build')
const SR = 44100
const DUR = 120
const N = SR * DUR
mkdirSync(OUT_DIR, { recursive: true })

const L = new Float32Array(N)
const R = new Float32Array(N)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const pane = (p) => (clamp(p, -1, 1) + 1) / 2

let seed = 20261018
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1

function put(i, v, pan) {
  if (i < 0 || i >= N) return
  const p = pane(pan)
  L[i] += v * (1 - p) * 1.25
  R[i] += v * p * 1.25
}

function env(t, start, dur, attack = 0.01, release = 0.3) {
  if (t < start || t > start + dur) return 0
  const x = t - start
  const a = attack <= 0 ? 1 : Math.min(1, x / attack)
  const rel = dur - release
  const r = x <= rel ? 1 : Math.pow(1 - (x - rel) / release, 2.2)
  return a * r
}

function tone({ start, dur, midi, amp, pan = 0, attack = 0.01, release = 0.3, harmonics = [1], detune = 0, vibrato = 0, vibRate = 5.2 }) {
  const f0 = mtof(midi) * (1 + detune)
  const i0 = Math.floor(start * SR)
  const n = Math.floor(dur * SR)
  for (let k = 0; k < n; k++) {
    const t = start + k / SR
    const e = env(t, start, dur, attack, release)
    if (e <= 0) continue
    const v = vibrato * Math.sin(2 * Math.PI * vibRate * k / SR)
    let s = 0
    for (let h = 0; h < harmonics.length; h++) {
      const f = f0 * (h + 1)
      if (f > 15000) continue
      s += harmonics[h] * Math.sin(2 * Math.PI * f * (t + v) + h * 0.7)
    }
    put(i0 + k, s * amp * e, pan)
  }
}

function noiseBurst({ start, dur, amp, pan = 0, lp = 3000, hp = 80, color = 1 }) {
  const i0 = Math.floor(start * SR)
  const n = Math.floor(dur * SR)
  const a = Math.exp(-2 * Math.PI * hp / SR)
  const b = Math.exp(-2 * Math.PI * lp / SR)
  let x1 = 0, x2 = 0, hpPrev = 0
  for (let k = 0; k < n; k++) {
    const t = start + k / SR
    const e = env(t, start, dur, 0.004, dur * 0.8)
    if (e <= 0) continue
    const w = rnd()
    x1 = (1 - b) * w + b * x1
    x2 = (1 - b) * x1 + b * x2
    hpPrev = a * (hpPrev + x2 - (k > 0 ? x2 : x2))
    const v = (hpPrev + x2 * 0.15) * color
    put(i0 + k, v * amp * e, pan)
  }
}

function sweepNoise({ start, dur, amp, f0 = 300, f1 = 3000, q = 1.2, pan = 0, attack = 0.08, release = 0.4 }) {
  const i0 = Math.floor(start * SR)
  const n = Math.floor(dur * SR)
  let low = 0, band = 0
  for (let k = 0; k < n; k++) {
    const t = start + k / SR
    const p = k / n
    const fc = f0 * Math.pow(f1 / f0, p)
    const f = 2 * Math.sin(Math.PI * Math.min(fc, 12000) / SR)
    const e = env(t, start, dur, attack, release)
    if (e <= 0) continue
    const x = rnd()
    low += f * band
    const high = x - low - q * band
    band += f * high
    put(i0 + k, band * amp * e, pan)
  }
}

function sweepTone({ start, dur, f0, f1, amp, pan = 0, attack = 0.02, release = 0.3 }) {
  const i0 = Math.floor(start * SR)
  const n = Math.floor(dur * SR)
  let ph = 0
  for (let k = 0; k < n; k++) {
    const t = start + k / SR
    const p = k / n
    const f = f0 * Math.pow(f1 / f0, p)
    ph += (2 * Math.PI * f) / SR
    const e = env(t, start, dur, attack, release)
    if (e <= 0) continue
    put(i0 + k, Math.sin(ph) * amp * e, pan)
  }
}

function ping({ start, freq = 1800, amp = 0.05, dur = 0.25, pan = 0, kind = 'sine' }) {
  const i0 = Math.floor(start * SR)
  const n = Math.floor(dur * SR)
  for (let k = 0; k < n; k++) {
    const e = Math.exp(-k / SR / (dur * 0.32))
    const ph = 2 * Math.PI * freq * k / SR
    const v = kind === 'metal' ? Math.sin(ph) + 0.5 * Math.sin(ph * 2.41) + 0.25 * Math.sin(ph * 3.77) : Math.sin(ph)
    put(i0 + k, v * amp * e, pan)
  }
}

function heartbeat(t0, amp = 0.09) {
  for (const [off, f, a] of [[0, 58, 1], [0.22, 44, 0.7]]) {
    const start = t0 + off
    const dur = 0.26
    const i0 = Math.floor(start * SR)
    const n = Math.floor(dur * SR)
    for (let k = 0; k < n; k++) {
      const t = start + k / SR
      const e = Math.exp(-k / SR / 0.075)
      const fr = f * (1 - 0.25 * (k / n))
      put(i0 + k, Math.sin(2 * Math.PI * fr * t) * amp * a * e, 0)
    }
  }
}

function hit(t0, amp = 1) {
  sweepTone({ start: t0, dur: 1.6, f0: 74, f1: 30, amp: 0.16 * amp, attack: 0.004, release: 1.3 })
  noiseBurst({ start: t0, dur: 0.1, amp: 0.12 * amp, lp: 6500, hp: 180 })
  for (const [i, f] of [150, 260, 430].entries()) ping({ start: t0 + i * 0.003, freq: f, amp: 0.03 * amp, dur: 0.8, kind: 'metal', pan: i % 2 ? 0.3 : -0.3 })
}

/* ---------------- 连续低音床 ---------------- */
for (let k = 0; k < N; k++) {
  const t = k / SR
  const bed =
    t < 12 ? 0.9 :
    t < 30 ? 0.7 :
    t < 47.3 ? 0.78 :
    t < 65.6 ? 0.86 :
    t < 81.8 ? 0.78 :
    t < 99.4 ? 0.70 + 0.30 * Math.min(1, (t - 81.8) / 16) :
    t < 100 ? 0 : t < 108.34 ? 0.92 : 1.0
  const breath = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.11 * t - 1.2)
  const sub = (Math.sin(2 * Math.PI * 27.5 * t) * 0.6 + Math.sin(2 * Math.PI * 55.06 * t) * 0.4) * breath
  const fadeIn = clamp(t / 5.0, 0, 1)
  const tail = t < 118.6 ? 1 : clamp((120 - t) / 1.4, 0, 1)
  put(k, sub * 0.11 * fadeIn * bed * tail, 0)
  put(k, (rnd() * 0.5) * 0.011 * fadeIn * bed * tail, 0)
}

/* ---------------- 0–12 冷启动 ---------------- */
hit(1.2, 0.7); hit(3.8, 0.85); hit(6.2, 1.0)
for (const t of [0.9, 2.4, 4.6, 5.2, 7.4, 9.1, 10.6, 11.4]) {
  noiseBurst({ start: t, dur: 0.04, amp: 0.13, lp: 9000, hp: 1200 })
  ping({ start: t, freq: 1900 + (t * 137) % 500, amp: 0.035, dur: 0.4, pan: t % 1 ? 0.25 : -0.25 })
}
tone({ start: 2.0, dur: 3.6, midi: 33, amp: 0.022, attack: 1.4, release: 1.8, harmonics: [1, 0.4, 0.12] })
sweepNoise({ start: 6.4, dur: 5.2, amp: 0.03, f0: 180, f1: 1400, q: 1.6, attack: 2.0, release: 1.6 })

/* ---------------- 12–30 内核自检 ---------------- */
sweepNoise({ start: 12.4, dur: 2.4, amp: 0.05, f0: 260, f1: 2600, q: 1.4, attack: 0.3, release: 0.6 })
for (let i = 0; i < 30; i++) {
  const t = 13.0 + i * 0.48
  ping({ start: t, freq: 2500 + (i % 4) * 180, amp: 0.03, dur: 0.12, pan: i % 2 ? 0.38 : -0.38 })
  if (i % 3 === 0) noiseBurst({ start: t, dur: 0.03, amp: 0.05, lp: 8000, hp: 900 })
}
for (let i = 0; i < 7; i++) heartbeat(14.5 + i * 1.55, 0.07)
for (let i = 0; i < 28; i++) ping({ start: 17.4 + i * 0.4, freq: 1500 + i * 22, amp: 0.014, dur: 0.16, pan: i % 2 ? 0.3 : -0.3 })
tone({ start: 18.0, dur: 9.0, midi: 40, amp: 0.02, attack: 2.5, release: 2.2, harmonics: [1, 0.3] })
/* 异常蜂鸣 → 校正 */
ping({ start: 24.8, freq: 1180, amp: 0.05, dur: 0.55, kind: 'metal', pan: -0.2 })
ping({ start: 24.83, freq: 1247, amp: 0.05, dur: 0.55, kind: 'metal', pan: 0.2 })
sweepTone({ start: 26.0, dur: 1.0, f0: 900, f1: 1800, amp: 0.02, attack: 0.1, release: 0.5 })
ping({ start: 26.2, freq: 2637, amp: 0.035, dur: 1.6, pan: 0.15 })
ping({ start: 28.0, freq: 1975, amp: 0.02, dur: 1.2, pan: -0.2 })

/* ---------------- 29.3–48 认知网络 ---------------- */
tone({ start: 29.3, dur: 18.4, midi: 45, amp: 0.028, attack: 2.2, release: 2.6, harmonics: [1, 0.28, 0.08] })
tone({ start: 29.3, dur: 18.4, midi: 52, amp: 0.016, attack: 2.8, release: 2.6, harmonics: [1, 0.2] })
const ARP = [57, 60, 62, 64, 67, 69, 72, 76, 79, 76, 72, 69, 67, 64, 62, 60]
ARP.forEach((m, i) => {
  const t = 30.4 + i * 1.05
  tone({ start: t, dur: 1.9, midi: m, amp: 0.042, attack: 0.02, release: 1.5, pan: i % 2 ? 0.45 : -0.45, harmonics: [1, 0.2, 0.07] })
  tone({ start: t, dur: 1.9, midi: m - 12, amp: 0.018, attack: 0.02, release: 1.5, pan: 0 })
})
for (let i = 0; i < 14; i++) ping({ start: 31.2 + i * 1.22, freq: 2200 + (i % 5) * 320, amp: 0.01, dur: 1.0, pan: i % 2 ? 0.55 : -0.55 })
sweepNoise({ start: 43.4, dur: 3.4, amp: 0.07, f0: 400, f1: 5200, q: 1.15, attack: 0.8, release: 0.5 })

/* ---------------- 47.3–65.6 世界模型：Am–F–C–G ---------------- */
const CHORDS = [
  { t: 47.3, root: 45, third: 48, fifth: 52 },   /* Am */
  { t: 51.8, root: 41, third: 45, fifth: 48 },   /* F  */
  { t: 56.3, root: 48, third: 52, fifth: 55 },   /* C  */
  { t: 60.8, root: 43, third: 47, fifth: 50 },   /* G  */
]
for (const c of CHORDS) {
  for (const [i, m] of [c.root, c.third, c.fifth, c.root + 12].entries()) {
    tone({ start: c.t, dur: 4.6, midi: m, amp: 0.03, attack: 1.1, release: 1.6, pan: (i - 1.5) * 0.24, harmonics: [1, 0.16, 0.05], detune: i * 0.0006 })
  }
  ping({ start: c.t + 0.05, freq: 1760, amp: 0.016, dur: 2.2, pan: 0.2 })
  ping({ start: c.t + 0.4, freq: 2349, amp: 0.012, dur: 2.0, pan: -0.25 })
}
for (let i = 0; i < 8; i++) heartbeat(49.0 + i * 2.25, 0.075)
for (let i = 0; i < 24; i++) ping({ start: 48.2 + i * 0.72, freq: 3000 + (i % 6) * 240, amp: 0.007, dur: 0.5, pan: i % 2 ? 0.6 : -0.6 })
sweepNoise({ start: 57.2, dur: 3.0, amp: 0.05, f0: 500, f1: 4200, q: 1.1, attack: 0.9, release: 0.6 })

/* ---------------- 65.6–81.8 工具桥接 ---------------- */
noiseBurst({ start: 66.0, dur: 0.5, amp: 0.15, lp: 9000, hp: 700 })
for (const [i, f] of [620, 930, 1310, 1870].entries()) ping({ start: 66.02 + i * 0.004, freq: f, amp: 0.05, dur: 0.8, kind: 'metal', pan: i % 2 ? 0.24 : -0.24 })
for (let i = 0; i < 10; i++) {
  const t = 66.6 + i * 1.5
  ping({ start: t, freq: 1000 + i * 120, amp: 0.045, dur: 0.42, pan: i % 2 ? 0.5 : -0.12 })
  noiseBurst({ start: t, dur: 0.03, amp: 0.035, lp: 9000, hp: 1400 })
}
for (let i = 0; i < 6; i++) heartbeat(66.8 + i * 2.45, 0.06)
for (let i = 0; i < 15; i++) ping({ start: 67.4 + i * 0.92, freq: 1400 + (i % 4) * 260, amp: 0.012, dur: 0.3, pan: i % 2 ? 0.35 : -0.1 })
tone({ start: 66.2, dur: 15.0, midi: 40, amp: 0.024, attack: 1.4, release: 2.0, harmonics: [1, 0.4] })
sweepNoise({ start: 75.0, dur: 5.4, amp: 0.06, f0: 380, f1: 5200, q: 1.1, attack: 1.2, release: 0.7 })

/* ---------------- 81.8–99.4 上下文装配 ---------------- */
sweepNoise({ start: 82.0, dur: 15.4, amp: 0.085, f0: 240, f1: 6200, q: 1.05, attack: 1.2, release: 0.9 })
sweepTone({ start: 82.2, dur: 16.0, f0: 110, f1: 880, amp: 0.045, attack: 2.0, release: 1.2 })
{
  let t = 83.0
  let gap = 0.52
  let n = 0
  while (t < 97.4) {
    ping({ start: t, freq: 1400 + (97.4 - t) * 46, amp: 0.030, dur: 0.1, pan: n % 4 === 0 ? -0.55 : n % 4 === 2 ? 0.55 : 0 })
    t += gap
    gap = Math.max(0.075, gap * 0.905)
    n++
  }
}
for (let i = 0; i < 9; i++) heartbeat(85.0 + i * 1.6, 0.06)
for (let i = 0; i < 26; i++) ping({ start: 84.0 + i * 0.56, freq: 2400 + (i % 7) * 200, amp: 0.008, dur: 0.6, pan: i % 2 ? 0.62 : -0.62 })
/* 99.4–100 静音蓄力：不加任何音 */

/* ---------------- 100–108.34 推理链 ---------------- */
heartbeat(100.4, 0.1); heartbeat(101.6, 0.1); heartbeat(102.8, 0.1)
heartbeat(104.0, 0.11); heartbeat(105.2, 0.11); heartbeat(106.4, 0.12); heartbeat(107.4, 0.13)
tone({ start: 100.2, dur: 8.1, midi: 33, amp: 0.03, attack: 1.2, release: 0.4, harmonics: [1, 0.5, 0.2] })
tone({ start: 101.0, dur: 7.3, midi: 46, amp: 0.012, attack: 1.4, release: 0.3, vibrato: 0.002, vibRate: 6.8 })
{
  let t = 100.6
  let gap = 0.30
  while (t < 108.2) {
    ping({ start: t, freq: 1800 + (108.2 - t) * 90, amp: 0.026, dur: 0.08, pan: t % 0.6 > 0.3 ? 0.4 : -0.4 })
    t += gap
    gap = Math.max(0.055, gap * 0.945)
  }
}
sweepTone({ start: 104.4, dur: 3.9, f0: 180, f1: 1500, amp: 0.05, attack: 0.4, release: 0.12 })
sweepNoise({ start: 104.6, dur: 3.7, amp: 0.09, f0: 400, f1: 9000, q: 1.0, attack: 0.4, release: 0.1 })

/* ---------------- 108.34 冲击 + 五音和弦 ---------------- */
sweepTone({ start: 108.34, dur: 2.6, f0: 66, f1: 26, amp: 0.34, attack: 0.004, release: 2.2 })
noiseBurst({ start: 108.34, dur: 0.1, amp: 0.24, lp: 7200, hp: 200 })
for (const [i, f] of [180, 320, 540, 880, 1320].entries()) ping({ start: 108.34 + i * 0.003, freq: f, amp: 0.05, dur: 1.1, kind: 'metal', pan: i % 2 ? 0.35 : -0.35 })
for (const [i, m] of [45, 52, 57, 60, 64].entries()) {
  tone({ start: 108.5, dur: 9.4, midi: m, amp: 0.033, attack: 1.6, release: 2.0, pan: (i - 2) * 0.22, harmonics: [1, 0.18, 0.06], detune: i * 0.0007 })
  tone({ start: 108.6, dur: 8.8, midi: m, amp: 0.014, attack: 2.0, release: 1.8, pan: -(i - 2) * 0.18, detune: -i * 0.0009 })
}
ping({ start: 109.4, freq: 2637, amp: 0.014, dur: 3.2, pan: 0.2 })
ping({ start: 109.6, freq: 3136, amp: 0.009, dur: 3.0, pan: -0.25 })

/* ---------------- 112.4–118 二次抬升 ---------------- */
for (const [i, m] of [57, 64, 69, 72].entries()) {
  tone({ start: 112.4, dur: 6.6, midi: m, amp: 0.016, attack: 1.6, release: 1.8, pan: (i - 1.5) * 0.26, harmonics: [1, 0.12] })
}
for (let i = 0; i < 10; i++) ping({ start: 112.8 + i * 0.55, freq: 2600 + (i % 4) * 340, amp: 0.008, dur: 1.1, pan: i % 2 ? 0.5 : -0.5 })
hit(115.9, 0.5)

/* ---------------- 118–120 交棒 + 尾声 ---------------- */
sweepTone({ start: 118.2, dur: 1.5, f0: 220, f1: 60, amp: 0.09, attack: 0.05, release: 1.2 })
sweepNoise({ start: 118.2, dur: 1.6, amp: 0.08, f0: 5000, f1: 300, q: 1.2, attack: 0.06, release: 1.2 })
ping({ start: 118.7, freq: 3520, amp: 0.006, dur: 1.6, pan: 0 })
tone({ start: 118.6, dur: 1.6, midi: 81, amp: 0.009, attack: 0.2, release: 1.2, pan: -0.2 })

/* ---------------- 母带 ---------------- */
let peak = 0
for (let k = 0; k < N; k++) {
  const t = k / SR
  const fade = t < 119.0 ? 1 : clamp((120 - t) / 1.0, 0, 1)
  L[k] = Math.tanh(L[k] * 1.12) * fade
  R[k] = Math.tanh(R[k] * 1.12) * fade
  peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]))
}
const norm = peak > 0 ? 0.92 / peak : 1
const wav = Buffer.alloc(44 + N * 4)
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8)
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34)
wav.write('data', 36); wav.writeUInt32LE(N * 4, 40)
for (let k = 0; k < N; k++) {
  wav.writeInt16LE(Math.round(clamp(L[k] * norm, -1, 1) * 32767), 44 + k * 4)
  wav.writeInt16LE(Math.round(clamp(R[k] * norm, -1, 1) * 32767), 46 + k * 4)
}
const musicWav = resolve(OUT_DIR, 'cinema-music.wav')
writeFileSync(musicWav, wav)
console.log('music', musicWav, (wav.length / 1e6).toFixed(2) + ' MB', 'peak', peak.toFixed(3))

/* ---------------- 旁白 ---------------- */
const LINES = [
  { t: 6.0, text: '冷启动。' },
  { t: 28.4, text: '自检，通过。' },
  { t: 44.0, text: '认知网络，展开。' },
  { t: 61.0, text: '世界模型，载入。' },
  { t: 78.0, text: '工具，接入。' },
  { t: 95.0, text: '上下文，装配。' },
  { t: 109.6, text: '通用人工智能，已就位。' },
  { t: 115.2, text: '一切问题，皆有解。' },
]
const vo = []
LINES.forEach((line, i) => {
  const aiff = resolve(OUT_DIR, 'cvo' + i + '.aiff')
  const raw = resolve(OUT_DIR, 'cvo' + i + '.wav')
  const out = resolve(OUT_DIR, 'cvo' + i + '-p.wav')
  execFileSync('say', ['-v', 'Tingting', '-r', '150', '-o', aiff, line.text])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', aiff, raw])
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', raw,
    '-af',
    'asetrate=44100*0.96,aresample=44100,atempo=1.019,highpass=f=95,' +
      'acompressor=threshold=0.12:ratio=3:attack=5:release=140:makeup=2,' +
      'aecho=0.8:0.55:28|64:0.16|0.09',
    out,
  ])
  const dur = (statSync(out).size - 44) / (SR * 2)
  vo.push({ path: out, t: line.t, dur })
  console.log('vo' + i, line.text, 'at', line.t + 's', 'dur', dur.toFixed(2) + 's')
})

/* ---------------- 混音 ---------------- */
const fullArgs = ['-y', '-loglevel', 'error', '-i', musicWav]
vo.forEach((v) => fullArgs.push('-i', v.path))
const delays = vo
  .map((v, i) => '[' + (i + 1) + ':a]adelay=' + Math.round(v.t * 1000) + '|' + Math.round(v.t * 1000) + ',volume=1.0,aformat=channel_layouts=stereo[v' + i + ']')
  .join(';')
const mixLabels = vo.map((_, i) => '[v' + i + ']').join('') + '[mus]'
const filter =
  delays +
  ';[0:a]volume=0.92[mus];' +
  mixLabels +
  'amix=inputs=' + (vo.length + 1) + ':normalize=0:duration=longest,aformat=channel_layouts=stereo,' +
  'loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95,atrim=0:120,afade=t=out:st=118.8:d=1.2[out]'
const mp3 = resolve(ROOT, 'assets/agi-boot-120.mp3')
fullArgs.push('-filter_complex', filter, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', mp3)
execFileSync('ffmpeg', fullArgs)
console.log('mixed', mp3, (statSync(mp3).size / 1e6).toFixed(2) + ' MB')
