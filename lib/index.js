/**
 * Host half of dsh-for-agi-splash.
 *
 * The animation itself is browser-side (lib/client.js). Its FIRST FRAME cannot be:
 * DSH's boot card ("HARNESS / Loading plugins…") is drawn by the shell before any
 * client plugin is materialised, so a client-only splash always leaves that card
 * on the glass for a few hundred milliseconds, at any z-index.
 *
 * The one surface that exists earlier is the served document. A `webserver/index-inject`
 * style row plus one synchronous script row land in index.html while <head> is still
 * being parsed — on the Web carrier the server renders them into the document, on the
 * Desktop carrier the page-side bootstrap applies the same rows before settling
 * __DSH_BOOT_READY__ — so the cover is painted before the shell can draw anything.
 *
 * Contract with lib/client.js:
 *
 *   OFF_KEY / ENABLED_KEY
 *                        the same localStorage keys as the 设置 → 开屏动画 switch.
 *                        `?agi=0`, the switch, and the legacy off-key all mean "boot
 *                        straight through"; the script below bows out so a user who
 *                        turned the splash off never sees a black frame either.
 *   window.__dshAgiSplash.end()
 *                        how the splash retires the cover once its shadow root is on
 *                        screen — same task, one paint, no seam. The boot watch and the
 *                        timeout are fallbacks: a client bundle that fails to load must
 *                        never leave a black window behind.
 *
 * @module dsh-for-agi-splash
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Must match src/client.template.js (module id / cordis id). */
export const name = 'agi-splash'

/** lib/client.js OFF_KEY — keep in sync. */
const OFF_KEY = 'dsh-for-agi-splash:off'
/** lib/client.js config key — the 设置 → 开屏动画 switch, keep in sync ('0' = off). */
const ENABLED_KEY = 'dsh-for-agi-splash:enabled'
/** Painted under the splash's own background, so the hand-off is invisible. */
const FIRST_FRAME_BG = '#000407'
/** Absolute ceiling (ms): past this the cover yields whatever is on the page. */
const FIRST_FRAME_MAX_MS = 12000
/** Below the splash host's 2147483000. */
const FIRST_FRAME_Z = 2147482000

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PREVIEW_FILE = resolve(ROOT, 'preview/splash.html')
const PREVIEW_30_FILE = resolve(ROOT, 'preview/splash-30.html')
const PREVIEW_120_FILE = resolve(ROOT, 'preview/splash-120.html')
const PREVIEW_ROUTE = '/dsh-for-agi-splash/preview'
const PREVIEW_30_ROUTE = '/dsh-for-agi-splash/preview/30'
const PREVIEW_120_ROUTE = '/dsh-for-agi-splash/preview/120'

/**
 * The cover: an opaque plate above anything the page paints and below the splash
 * that replaces it. pointer-events stays off — what it covers is not interactive yet.
 */
const FIRST_FRAME_CSS =
  'html.agi-first::before{content:"";position:fixed;inset:0;background:' +
  FIRST_FRAME_BG +
  ';z-index:' +
  String(FIRST_FRAME_Z) +
  ';pointer-events:none}\n' +
  'html.agi-first{background:' +
  FIRST_FRAME_BG +
  '}'

/**
 * Class marker + handshake + fallbacks. Deliberately tiny and synchronous: it runs
 * while <head> is being parsed, so the cover exists before the first paint.
 *
 * The 250 ms watch ends the cover as soon as DSH's boot card is gone (the kernel
 * removes the card when the application mounts) or as soon as the card drops its
 * spinner, which is how the card renders a failure — a broken page must stay
 * readable rather than hidden.
 */
const FIRST_FRAME_SCRIPT =
  '(function(){' +
  'try{' +
  'if(new URLSearchParams(location.search).get("agi")==="0")return;' +
  'var ls=window.localStorage;' +
  'if(ls.getItem(' +
  JSON.stringify(OFF_KEY) +
  ')==="1")return;' +
  'if(ls.getItem(' +
  JSON.stringify(ENABLED_KEY) +
  ')==="0")return' +
  '}catch(error){}' +
  'var root=document.documentElement;' +
  'var watch=null;' +
  'var end=function(){' +
  'if(watch!==null){window.clearInterval(watch);watch=null}' +
  'root.classList.remove("agi-first")' +
  '};' +
  'window.__dshAgiSplash={end:end};' +
  'root.classList.add("agi-first");' +
  'var seen=false;' +
  'watch=window.setInterval(function(){' +
  'var card=document.querySelector("[data-dsh-boot]");' +
  'if(card===null){if(seen)end();return}' +
  'seen=true;' +
  'if(card.querySelector("[data-dsh-boot-spinner]")===null)end()' +
  '},250);' +
  'window.setTimeout(end,' +
  String(FIRST_FRAME_MAX_MS) +
  ');' +
  '})()'

/**
 * A replay surface so the animation can be watched again without restarting the app:
 * GET /dsh-for-agi-splash/preview serves the same scene as a plain page.
 */
function previewHandler(file) {
  return function handle(req, res) {
  try {
    const body = readFileSync(file)
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch (error) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('preview not built: run npm run build')
    }
  }
}

/**
 * Contribute the first frame to every index response, and mount the replay route.
 *
 * No service is injected for the injection itself: `webserver/index-inject` is a plain
 * composition event, so a profile without an HTTP carrier still gets the splash — only
 * the preview route is skipped.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: FIRST_FRAME_CSS })
    table.push({ kind: 'script', placement: 'head', text: FIRST_FRAME_SCRIPT })
  })

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: PREVIEW_ROUTE,
          handler: previewHandler(PREVIEW_FILE),
        }),
      'agi-splash: GET ' + PREVIEW_ROUTE,
    )
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: PREVIEW_30_ROUTE,
          handler: previewHandler(PREVIEW_30_FILE),
        }),
      'agi-splash: GET ' + PREVIEW_30_ROUTE,
    )
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: PREVIEW_120_ROUTE,
          handler: previewHandler(PREVIEW_120_FILE),
        }),
      'agi-splash: GET ' + PREVIEW_120_ROUTE,
    )
  })
}
