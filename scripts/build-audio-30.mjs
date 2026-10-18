#!/usr/bin/env node
/**
 * 30 秒剧场版音轨：纯 Node 合成音乐床 + macOS say 旁白，ffmpeg 混音。
 *
 * 输出：assets/agi-boot-30.mp3（30.0 s，44.1 kHz 立体声）
 * 中间产物：assets/build/*.wav（不入库，build.mjs 只读 mp3）
 *
 * 时间轴与 src/scene/agi30.html 的五幕严格对齐：
 *   0.0–3.0   冷启动（黑场、低频呼吸、继电器）
 *   3.0–7.5   自检（扫描、数据滴答、心跳、插件装载）
 *   7.5–14.0  认知网络（琶音上行）
 *   14.0–19.0 工具桥接（金属咬合、铜线脉冲）
 *   19.0–23.15 上下文装配（加速 riser）
 *   23.15–23.6 静音蓄力
 *   23.6–27.4  AGI 落定（冲击 + 和弦）
 *   27.4–30.0 交棒（尾声）
 */
import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'assets/build')
const SR = 44100
const DUR = 30
const N = SR * DUR
mkdirSync(OUT_DIR, { recursive: true })

const L = new Float32Array(N)
const R = new Float32Array(N)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const pane = (p) => (clamp(p, -1, 1) + 1) / 2

/** 确定性噪声：任何机器上生成同一份音频（旁白除外）。 */
let seed = 20261018
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1

function put(i, v, pan) {
  if (i < 0 || i >= N) return
  const p = pane(pan)
  L[i] += v * (1 - p) * 1.25
  R[i] += v * p * 1.25
}

/** 音头软、尾巴指数衰减的包络。 */
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
    /* 两个一阶低通串联 + 一阶高通近似 */
    x1 = (1 - b) * w + b * x1
    x2 = (1 - b) * x1 + b * x2
    hpPrev = a * (hpPrev + x2 - (k > 0 ? x2 : x2))
    const v = (hpPrev + x2 * 0.15) * color
    put(i0 + k, v * amp * e, pan)
  }
}

/** 状态变量带通 + 扫频，用在 whoosh / riser 上。 */
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
    const t = start + k / SR
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

/* ---------------- 0.0–3.0 冷启动：低频呼吸 + 空气 ---------------- */
for (let k = 0; k < N; k++) {
  const t = k / SR
  const breath = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.11 * t - 1.2)
  const sub = (Math.sin(2 * Math.PI * 27.5 * t) * 0.6 + Math.sin(2 * Math.PI * 55.06 * t) * 0.4) * breath
  const fadeIn = clamp(t / 4.2, 0, 1)
  const duck = t > 23.15 && t < 23.6 ? 0 : 1
  const tail = t < 29 ? 1 : clamp((30 - t) / 1, 0, 1)
  put(k, sub * 0.11 * fadeIn * duck * tail, 0)
  put(k, (rnd() * 0.5) * 0.012 * fadeIn * duck * tail, 0)
}
tone({ start: 0.9, dur: 0.35, midi: 69, amp: 0.03, attack: 0.08, release: 0.2, pan: -0.3 })
noiseBurst({ start: 1.33, dur: 0.05, amp: 0.16, lp: 9000, hp: 1200 })
ping({ start: 1.34, freq: 2100, amp: 0.05, dur: 0.5, pan: 0.2 })
ping({ start: 2.2, freq: 880, amp: 0.02, dur: 0.9, pan: -0.2 })

/* ---------------- 3.0–7.5 自检 ---------------- */
sweepNoise({ start: 3.1, dur: 2.3, amp: 0.05, f0: 260, f1: 2400, q: 1.4, attack: 0.3, release: 0.6 })
for (let i = 0; i < 28; i++) {
  const t = 3.55 + i * 0.108
  ping({ start: t, freq: 2600 + (i % 4) * 180, amp: 0.028, dur: 0.12, pan: i % 2 ? 0.35 : -0.35 })
  if (i % 4 === 0) noiseBurst({ start: t, dur: 0.03, amp: 0.05, lp: 8000, hp: 900 })
}
heartbeat(4.7); heartbeat(5.8); heartbeat(6.9)
tone({ start: 6.6, dur: 0.9, midi: 57, amp: 0.035, attack: 0.2, release: 0.5, harmonics: [1, 0.35, 0.15] })
ping({ start: 7.2, freq: 1320, amp: 0.04, dur: 0.7, pan: 0.1 })

/* ---------------- 7.5–14.0 认知网络：琶音 ---------------- */
const ARP = [57, 60, 62, 64, 67, 69, 72, 76, 79, 76, 72, 69, 67, 64]
ARP.forEach((m, i) => {
  const t = 7.8 + i * 0.37
  tone({ start: t, dur: 1.1, midi: m, amp: 0.045, attack: 0.02, release: 0.9, pan: i % 2 ? 0.42 : -0.42, harmonics: [1, 0.2, 0.08] })
  tone({ start: t, dur: 1.1, midi: m - 12, amp: 0.02, attack: 0.02, release: 0.9, pan: 0 })
})
tone({ start: 9.0, dur: 4.6, midi: 45, amp: 0.03, attack: 1.2, release: 1.6, harmonics: [1, 0.3] })
tone({ start: 12.6, dur: 1.5, midi: 84, amp: 0.012, attack: 0.4, release: 0.8, vibrato: 0.0015, vibRate: 6.2 })
tone({ start: 12.9, dur: 1.2, midi: 88, amp: 0.009, attack: 0.4, release: 0.8 })

/* ---------------- 14.0–19.0 工具桥接 ---------------- */
noiseBurst({ start: 14.06, dur: 0.5, amp: 0.14, lp: 9000, hp: 700 })
for (const [i, f] of [620, 930, 1310, 1870].entries()) ping({ start: 14.08 + i * 0.004, freq: f, amp: 0.05, dur: 0.7, kind: 'metal', pan: i % 2 ? 0.2 : -0.2 })
for (let i = 0; i < 8; i++) {
  const t = 14.65 + i * 0.55
  ping({ start: t, freq: 1180 + i * 130, amp: 0.045, dur: 0.3, pan: i % 2 ? 0.5 : -0.1 })
}
for (let i = 0; i < 5; i++) heartbeat(14.5 + i * 1.0, 0.06)
tone({ start: 15.0, dur: 3.6, midi: 40, amp: 0.025, attack: 0.8, release: 1.2, harmonics: [1, 0.4] })

/* ---------------- 19.0–23.15 装配：加速 riser ---------------- */
sweepTone({ start: 19.2, dur: 3.9, f0: 150, f1: 1100, amp: 0.05, attack: 0.6, release: 0.3 })
sweepNoise({ start: 19.3, dur: 3.8, amp: 0.09, f0: 300, f1: 5200, q: 1.1, attack: 0.6, release: 0.25 })
{
  let t = 19.4
  let gap = 0.5
  while (t < 23.05) {
    ping({ start: t, freq: 1500 + (23.05 - t) * 300, amp: 0.03, dur: 0.1, pan: (t * 3) % 1 > 0.5 ? 0.3 : -0.3 })
    t += gap
    gap = Math.max(0.075, gap * 0.87)
  }
}
/* 静音蓄力：23.15–23.6 什么都不加 */

/* ---------------- 23.6 冲击 + 和弦 ---------------- */
sweepTone({ start: 23.6, dur: 2.2, f0: 62, f1: 28, amp: 0.3, attack: 0.004, release: 1.9 })
noiseBurst({ start: 23.6, dur: 0.09, amp: 0.22, lp: 7000, hp: 200 })
for (const [i, f] of [180, 320, 540, 880, 1320].entries()) ping({ start: 23.6 + i * 0.003, freq: f, amp: 0.05, dur: 1.0, kind: 'metal', pan: i % 2 ? 0.35 : -0.35 })
for (const [i, m] of [45, 52, 57, 60, 64].entries()) {
  tone({ start: 23.75, dur: 6.0, midi: m, amp: 0.032, attack: 1.5, release: 1.6, pan: (i - 2) * 0.22, harmonics: [1, 0.18, 0.06], detune: i * 0.0007 })
  tone({ start: 23.8, dur: 5.6, midi: m, amp: 0.014, attack: 1.8, release: 1.4, pan: -(i - 2) * 0.18, detune: -i * 0.0009 })
}
ping({ start: 24.4, freq: 2637, amp: 0.012, dur: 2.4, pan: 0.2 })
ping({ start: 24.5, freq: 3136, amp: 0.008, dur: 2.2, pan: -0.25 })
ping({ start: 27.5, freq: 3520, amp: 0.006, dur: 1.8, pan: 0 })
tone({ start: 27.4, dur: 2.2, midi: 81, amp: 0.01, attack: 0.5, release: 1.2, pan: -0.2 })
tone({ start: 27.6, dur: 1.8, midi: 88, amp: 0.007, attack: 0.5, release: 1.0, pan: 0.25 })

/* ---------------- 母带 ---------------- */
let peak = 0
for (let k = 0; k < N; k++) {
  const t = k / SR
  const fade = t < 29.2 ? 1 : clamp((30 - t) / 0.8, 0, 1)
  L[k] = Math.tanh(L[k] * 1.15) * fade
  R[k] = Math.tanh(R[k] * 1.15) * fade
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
const musicWav = resolve(OUT_DIR, 'theatrical-music.wav')
writeFileSync(musicWav, wav)
console.log('music', musicWav, (wav.length / 1e6).toFixed(2) + ' MB', 'peak', peak.toFixed(3))

/* ---------------- 旁白 ---------------- */
const LINES = [
  { t: 7.85, text: '认知网络，展开。' },
  { t: 14.55, text: '工具，接入。' },
  { t: 24.15, text: '通用人工智能，已就位。' },
  { t: 27.45, text: '一切问题，皆有解。' },
]
const vo = []
LINES.forEach((line, i) => {
  const aiff = resolve(OUT_DIR, 'vo' + i + '.aiff')
  const raw = resolve(OUT_DIR, 'vo' + i + '.wav')
  const out = resolve(OUT_DIR, 'vo' + i + '-p.wav')
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
  /* 只有 ffmpeg（没有 ffprobe）：mono 16-bit 44.1k WAV 的时长直接由文件头算 */
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
  'loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95,atrim=0:30,afade=t=out:st=29.1:d=0.9[out]'
const mp3 = resolve(ROOT, 'assets/agi-boot-30.mp3')
fullArgs.push('-filter_complex', filter, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', mp3)
execFileSync('ffmpeg', fullArgs)
console.log('mixed', mp3, (statSync(mp3).size / 1e6).toFixed(2) + ' MB')
