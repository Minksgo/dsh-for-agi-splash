/**
 * Client half of dsh-for-agi-splash.
 *
 * The splash is mounted at MODULE EVALUATION time — the earliest a client plugin
 * can paint, while the module system is still draining and before cordis resolves
 * the service graph. The host half (lib/index.js) has already covered the shell
 * with an opaque background through webserver/index-inject, so this file only has
 * to put its shadow root on the glass and retire that cover in the same task
 * (releaseCover -> window.__dshAgiSplash.end()).
 *
 * Everything the scene needs — stylesheet, SVG stage, narration audio — is inlined
 * by scripts/build.mjs. The overlay is a shadow root, so no DSH style can reach it
 * and none of its style can leak back into the app.
 *
 * @module dsh-for-agi-splash
 */
window.__ModuleLoader__.load({
	id: 'dsh-for-agi-splash',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const HOST_CSS = `
		:host{position:fixed;inset:0;display:block;box-sizing:border-box;z-index:2147483000;background:#000407}
		/* 两段式退场：先让画面沉进自己的底色，再把底色淡掉，避免大 logo 直接溶解成界面上的灰影 */
		:host(.agi-out){opacity:0;transition:opacity 420ms cubic-bezier(.4,0,.2,1) 200ms}
		:host(.agi-out) #boot{opacity:0;transition:opacity 200ms ease-out}
		#boot{position:absolute;inset:0;background:#000407}
		#agiScene{position:absolute;inset:0;width:100%;height:100%;display:block}
		#agiScene text{font-family:"PingFang SC","SF Mono",Menlo,Monaco,Consolas,monospace}
		#agiAudio{display:none}
		.agi-skip{position:absolute;left:0;right:0;bottom:10px;text-align:center;font:10px/1.6 "PingFang SC","SF Mono",monospace;letter-spacing:.22em;color:#3f8493;opacity:.55;pointer-events:none}
		`;

		const SCENE_CSS = `
		:host{color-scheme:dark}
		`;

		/*__ASSETS__*/

		const OFF_KEY = 'dsh-for-agi-splash:off';
		const FADE_MS = 700;

		let host = null;
		let stage = null;
		let cancelled = false;
		let finished = false;
		const timers = [];

		function later(fn, ms) {
			const id = window.setTimeout(fn, ms);
			timers.push(id);
			return id;
		}

		function clearTimers() {
			for (const id of timers) window.clearTimeout(id);
			timers.length = 0;
		}

		/** 关掉本插件的两种方式：本次会话 ?agi=0，或持久 localStorage 键。 */
		function readOff() {
			try {
				if (new URLSearchParams(location.search).get('agi') === '0') return true;
				if (window.localStorage.getItem(OFF_KEY) === '1') return true;
			} catch (error) {
				/* 隐私模式下取不到 localStorage，就按默认播放 */
			}
			return false;
		}

		function prefersReduced() {
			try {
				return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			} catch (error) {
				return false;
			}
		}

		/** 撤掉宿主半在首帧涂的那层底色；幂等，宿主没装也只是空调用。 */
		function releaseCover() {
			try {
				if (window.__dshAgiSplash && typeof window.__dshAgiSplash.end === 'function') window.__dshAgiSplash.end();
			} catch (error) {
				/* 绝不能因为宿主半的问题把动画自己打断 */
			}
		}

		function finish() {
			if (finished) return;
			finished = true;
			cancelled = true;
			clearTimers();
			releaseCover();
			if (host === null) return;
			const el = host;
			host = null;
			try {
				el.classList.add('agi-out');
			} catch (error) {}
			window.setTimeout(() => {
				try {
					el.remove();
				} catch (error) {}
			}, FADE_MS);
		}

		function onKey(event) {
			if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
				event.preventDefault();
				finish();
			}
		}

		/*__PLAY_BOOT__*/

		function mount() {
			if (host !== null) return host;
			if (document.body === null) {
				document.addEventListener('DOMContentLoaded', mount, { once: true });
				return null;
			}
			if (readOff()) {
				releaseCover();
				return null;
			}
			host = document.createElement('div');
			host.className = 'agi-splash-host';
			host.setAttribute('aria-hidden', 'true');
			const shadow = host.attachShadow({ mode: 'open' });
			shadow.innerHTML =
				'<style>' + HOST_CSS + SCENE_CSS + '</style>' +
				'<div id="boot">' + BOOT_SVG + '<audio id="agiAudio" preload="auto"></audio></div>' +
				'<div class="agi-skip">点击任意处跳过 · ESC</div>';
			document.body.appendChild(host);
			stage = shadow;
			/* 与宿主半的握手：同一任务里退休底色，中间不出一帧空白。 */
			releaseCover();
			const reduced = prefersReduced();
			if (reduced) {
				try {
					shadow.querySelector('#agiAudio').muted = true;
				} catch (error) {}
			}
			const total = playBoot();
			host.addEventListener('pointerdown', finish, { passive: true });
			window.addEventListener('keydown', onKey, true);
			window.setTimeout(finish, (reduced ? 1200 : total > 0 ? total : 400) + 260);
			return host;
		}

		/* 模块求值即上屏：比 apply() 早，比 DSH 的启动卡片晚不了多少。 */
		const overlay = mount();

		exports.name = 'agi-splash';
		exports.apply = (ctx) => {
			ctx.effect(
				() => () => {
					try {
						window.removeEventListener('keydown', onKey, true);
					} catch (error) {}
					finish();
				},
				'dsh-for-agi-splash: splash teardown',
			);
		};
		return module.exports;
	},
});
