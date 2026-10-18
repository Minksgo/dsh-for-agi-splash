/**
 * Client half of dsh-for-agi-splash.
 *
 * Two surfaces:
 *
 *   the splash   mounted at MODULE EVALUATION time — the earliest a client plugin
 *                can paint, while the module system is still draining and before
 *                cordis resolves the service graph. The host half (lib/index.js)
 *                has already covered the shell with an opaque background through
 *                webserver/index-inject, so this file only has to put its shadow
 *                root on the glass and retire that cover in the same task
 *                (releaseCover -> window.__dshAgiSplash.end()).
 *
 *   the settings 设置 → 开屏动画: 开关 / 音量 / 跳过提示语 / 重新播放. A page of
 *                its own (settings.section), not rows borrowed from 通用 — the
 *                shared General ledger is a tie-prone sort key, and this plugin
 *                has four rows that belong together.
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

		/* React only feeds the settings page. Guarded: if the shell hands this module
		   no React (a non-web carrier, a trimmed boot), the splash must still play. */
		let React = null;
		try {
			React = require('react');
		} catch (error) {
			React = null;
		}

		const HOST_CSS = `
		:host{position:fixed;inset:0;display:block;box-sizing:border-box;z-index:2147483000;background:#000407}
		/* 两段式退场：先让画面沉进自己的底色，再把底色淡掉，避免大 logo 直接溶解成界面上的灰影 */
		:host(.agi-out){opacity:0;transition:opacity 420ms cubic-bezier(.4,0,.2,1) 200ms}
		:host(.agi-out) #boot{opacity:0;transition:opacity 200ms ease-out}
		#boot{position:absolute;inset:0;background:#000407}
		.agi-cut{position:absolute;inset:0;display:none}
		.agi-cut.on{display:block}
		#agiScene,#agiScene30{position:absolute;inset:0;width:100%;height:100%;display:block}
		#agiScene text,#agiScene30 text{font-family:"PingFang SC","SF Mono",Menlo,Monaco,Consolas,monospace}
		#agiAudio{display:none}
		.agi-skip{position:absolute;left:0;right:0;bottom:10px;text-align:center;font:10px/1.6 "PingFang SC","SF Mono",monospace;letter-spacing:.22em;color:#3f8493;opacity:.55;pointer-events:none}
		`;

		const SCENE_CSS = `
		:host{color-scheme:dark}
		`;

		/*__ASSETS__*/

		/* ===== 配置：全部存在渲染进程 localStorage =====
		   之所以不用 profile 配置：开屏属于「这台机器的观感」，跟 profile 一起迁移反而会
		   把别人机器上的音量带过来；localStorage 天然按机器 / 按浏览器路径隔离。 */
		const CFG = 'dsh-for-agi-splash:';
		const DEFAULT_HINT = '点击任意处跳过 · ESC';
		const FADE_MS = 700;

		/** 'auto' 装完或升级后播一次剧场版；'long' 每次 30 s；'short' 每次 9.9 s。 */
		function readMode() {
			try {
				const raw = window.localStorage.getItem(CFG + 'mode');
				if (raw === 'long' || raw === 'short') return raw;
			} catch (error) {}
			return 'auto';
		}

		/** auto 模式下判断：本机第一次打开、或版本变了 → 剧场版。 */
		function pickCut(force) {
			if (force === 'long' || force === 'short') return force;
			const mode = readMode();
			if (mode === 'long' || mode === 'short') return mode;
			try {
				return window.localStorage.getItem(CFG + 'version') === PLUGIN_VERSION ? 'short' : 'long';
			} catch (error) {
				return 'short';
			}
		}

		/** 剧场版播过就记版本；自动模式靠它避免每次启动都放 30 秒。 */
		function markSeen(cut) {
			if (cut !== 'long') return;
			try {
				window.localStorage.setItem(CFG + 'version', PLUGIN_VERSION);
			} catch (error) {}
		}

		function readConfig() {
			const out = { enabled: true, volume: 0.9, hint: DEFAULT_HINT, mode: readMode() };
			try {
				const ls = window.localStorage;
				if (ls.getItem(CFG + 'enabled') === '0') out.enabled = false;
				if (ls.getItem(CFG + 'off') === '1') out.enabled = false;
				const raw = ls.getItem(CFG + 'volume');
				if (raw !== null) {
					const v = Number(raw);
					if (Number.isFinite(v) && v >= 0 && v <= 1) out.volume = v;
				}
				const hint = ls.getItem(CFG + 'hint');
				if (hint !== null) out.hint = hint;
			} catch (error) {
				/* 隐私模式下取不到 localStorage，就按默认配置播放 */
			}
			return out;
		}

		function writeConfig(patch) {
			try {
				const ls = window.localStorage;
				if ('enabled' in patch) ls.setItem(CFG + 'enabled', patch.enabled ? '1' : '0');
				if ('volume' in patch) ls.setItem(CFG + 'volume', String(patch.volume));
				if ('hint' in patch) ls.setItem(CFG + 'hint', patch.hint);
				if ('mode' in patch) ls.setItem(CFG + 'mode', patch.mode);
			} catch (error) {
				/* 存不下就只在本次生效 */
			}
		}

		/* 让 build.mjs 拼出来的 playBoot 拿到当前音量，而不是写死 0.9。 */
		globalThis.__agiSplashVolume = () => readConfig().volume;

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

		/** 关掉本插件的三种方式：?agi=0、设置页开关、旧的 localStorage 关闭键。 */
		function readOff() {
			try {
				if (new URLSearchParams(location.search).get('agi') === '0') return true;
			} catch (error) {
				/* 没有 location.search 就当没写 */
			}
			return !readConfig().enabled;
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

		function removeKeyListener() {
			try {
				window.removeEventListener('keydown', onKey, true);
			} catch (error) {}
		}

		function finish() {
			if (finished) return;
			finished = true;
			cancelled = true;
			clearTimers();
			removeKeyListener();
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

		function escapeHtml(text) {
			return String(text)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;');
		}

		/*__PLAY_BOOT__*/

		/**
		 * 上屏。
		 * @param force true = 用户在设置里点了「重新播放」，忽略开关。
		 */
		function mount(force) {
			if (host !== null) return host;
			const explicit = force === 'long' || force === 'short' ? force : null;
			if (explicit === null && force !== true && readOff()) {
				releaseCover();
				return null;
			}
			if (document.body === null) {
				document.addEventListener('DOMContentLoaded', () => mount(force), { once: true });
				return null;
			}
			const config = readConfig();
			const hint = String(config.hint || '').trim();
			host = document.createElement('div');
			host.className = 'agi-splash-host';
			host.setAttribute('aria-hidden', 'true');
			const shadow = host.attachShadow({ mode: 'open' });
			shadow.innerHTML =
				'<style>' + HOST_CSS + SCENE_CSS + '</style>' +
				'<div id="boot">' + BOOT_SVG + '<audio id="agiAudio" preload="auto"></audio></div>' +
				(hint === '' ? '' : '<div class="agi-skip">' + escapeHtml(hint) + '</div>');
			document.body.appendChild(host);
			stage = shadow;
			finished = false;
			cancelled = false;
			/* 与宿主半的握手：同一任务里退休底色，中间不出一帧空白。 */
			releaseCover();
			const reduced = prefersReduced();
			if (reduced && explicit === null) {
				try {
					shadow.querySelector('#agiAudio').muted = true;
				} catch (error) {}
			}
			const cut = explicit !== null ? explicit : reduced ? 'short' : pickCut(undefined);
			const total = playBoot(cut);
			markSeen(cut);
			host.addEventListener('pointerdown', finish, { passive: true });
			window.addEventListener('keydown', onKey, true);
			window.setTimeout(finish, (reduced && explicit === null ? 1200 : total > 0 ? total : 400) + 260);
			return host;
		}

		/** 重新播放：先当场拆掉旧的，再忽略开关重新上屏。 */
		function replay(cut) {
			const old = host;
			host = null;
			if (old !== null) {
				try {
					old.remove();
				} catch (error) {}
			}
			finished = false;
			cancelled = false;
			clearTimers();
			removeKeyListener();
			mount(cut === 'long' || cut === 'short' ? cut : true);
		}

		/* 模块求值即上屏：比 apply() 早，比 DSH 的启动卡片晚不了多少。 */
		mount(false);

		/* ===== 设置页：设置 → 开屏动画 ===== */
		const UI = {
			card: {
				borderRadius: '18px',
				border: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
				background: 'color-mix(in srgb, currentColor 5%, transparent)',
				boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
				padding: '4px 20px',
			},
			row: {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: '24px',
				padding: '16px 0',
				borderTop: '1px solid color-mix(in srgb, currentColor 10%, transparent)',
			},
			label: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
			title: { fontSize: '14px', fontWeight: 500, letterSpacing: '0.01em' },
			desc: { fontSize: '12px', lineHeight: 1.55, opacity: 0.62, maxWidth: '46ch' },
			mono: { fontFamily: '"SF Mono",Menlo,Monaco,Consolas,monospace', fontSize: '12px', opacity: 0.8 },
			input: {
				width: '240px',
				boxSizing: 'border-box',
				padding: '8px 12px',
				borderRadius: '10px',
				border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
				background: 'color-mix(in srgb, currentColor 6%, transparent)',
				color: 'inherit',
				font: 'inherit',
				fontSize: '13px',
				outline: 'none',
			},
			switch: (on) => ({
				position: 'relative',
				width: '44px',
				height: '26px',
				flex: '0 0 auto',
				padding: 0,
				borderRadius: '999px',
				border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
				cursor: 'pointer',
				background: on ? '#3fc8dc' : 'color-mix(in srgb, currentColor 14%, transparent)',
				transition: 'background 160ms ease',
			}),
			knob: (on) => ({
				position: 'absolute',
				top: '3px',
				left: on ? '21px' : '3px',
				width: '18px',
				height: '18px',
				borderRadius: '50%',
				background: on ? '#041013' : 'rgba(255,255,255,0.9)',
				transition: 'left 160ms ease',
			}),
			button: (primary) => ({
				appearance: 'none',
				cursor: 'pointer',
				padding: '8px 16px',
				borderRadius: '999px',
				font: 'inherit',
				fontSize: '13px',
				border: '1px solid color-mix(in srgb, currentColor ' + (primary ? '0%' : '22%') + ', transparent)',
				background: primary ? '#3fc8dc' : 'transparent',
				color: primary ? '#04121a' : 'inherit',
				fontWeight: primary ? 600 : 400,
			}),
		};

		function Row(props) {
			return React.createElement(
				'div',
				{ style: props.first ? Object.assign({}, UI.row, { borderTop: 'none' }) : UI.row },
				React.createElement(
					'div',
					{ style: UI.label },
					React.createElement('div', { style: UI.title }, props.title),
					props.desc === undefined ? null : React.createElement('div', { style: UI.desc }, props.desc),
				),
				props.children,
			);
		}

		function Switch(props) {
			return React.createElement(
				'button',
				{
					type: 'button',
					role: 'switch',
					'aria-checked': props.on,
					title: props.on ? '点击关闭' : '点击开启',
					onClick: props.onClick,
					style: UI.switch(props.on),
				},
				React.createElement('span', { style: UI.knob(props.on) }),
			);
		}

		function AgiSplashSettings() {
			const [config, setConfig] = React.useState(readConfig);
			const [playing, setPlaying] = React.useState(false);

			const update = (patch) => {
				writeConfig(patch);
				setConfig(readConfig());
			};

			const startReplay = (cut) => {
				setPlaying(true);
				try {
					replay(cut);
				} catch (error) {
					/* 上屏失败也不能把设置页带崩 */
				}
				window.setTimeout(() => setPlaying(false), cut === 'long' ? 31200 : 10400);
			};

			const openPreview = (cut) => {
				try {
					const path = cut === 'long' ? '/dsh-for-agi-splash/preview/30' : '/dsh-for-agi-splash/preview';
					window.open(location.origin + path, '_blank', 'noopener');
				} catch (error) {}
			};

			const modeButton = (value, label) =>
				React.createElement(
					'button',
					{
						key: value,
						type: 'button',
						onClick: () => update({ mode: value }),
						style: UI.button(config.mode === value),
					},
					label,
				);

			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '8px' } },
				React.createElement(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
					React.createElement('div', { style: { fontSize: '15px', fontWeight: 600 } }, '开屏动画'),
					React.createElement(
						'div',
						{ style: UI.desc },
						'两套片头：9.9 秒精简版五幕启动链，和 30 秒剧场版（冷启动 → 自检 → 认知网络 → 工具桥接 → 上下文装配 → AGI 就位 → 交棒）。都有中文旁白与全片音效，随时点击跳过。配置仅存于本机浏览器，换机器不跟随。',
					),
				),
				React.createElement(
					'div',
					{ style: UI.card },
					React.createElement(
						Row,
						{
							first: true,
							title: '启用开屏动画',
							desc: '关闭后启动直接进界面；下面的「重新播放」不受这个开关影响。',
						},
						React.createElement(Switch, {
							on: config.enabled,
							onClick: () => update({ enabled: !config.enabled }),
						}),
					),
					React.createElement(
						Row,
						{
							title: '播放模式',
							desc: '自动：装完或升级后的第一次启动播 30 秒剧场版，之后每次 9.9 秒；也可以固定其中一版。',
						},
						React.createElement(
							'div',
							{ style: { display: 'flex', gap: '6px', flex: '0 0 auto' } },
							modeButton('auto', '自动'),
							modeButton('long', '每次剧场版'),
							modeButton('short', '每次精简版'),
						),
					),
					React.createElement(
						Row,
						{ title: '音量', desc: '旁白与音效的整体响度。浏览器拦截自动播放时会自动静音一次，不影响画面。' },
						React.createElement(
							'div',
							{ style: { display: 'flex', alignItems: 'center', gap: '10px' } },
							React.createElement('input', {
								type: 'range',
								min: 0,
								max: 100,
								step: 5,
								value: Math.round(config.volume * 100),
								onChange: (event) => update({ volume: Number(event.target.value) / 100 }),
								style: { width: '180px', accentColor: '#3fc8dc', cursor: 'pointer' },
							}),
							React.createElement('span', { style: UI.mono }, Math.round(config.volume * 100) + '%'),
						),
					),
					React.createElement(
						Row,
						{ title: '跳过提示语', desc: '左侧底部那行小字。留空则不显示提示。' },
						React.createElement('input', {
							type: 'text',
							value: config.hint,
							placeholder: DEFAULT_HINT,
							spellCheck: false,
							onChange: (event) => update({ hint: event.target.value }),
							style: UI.input,
						}),
					),
					React.createElement(
						Row,
						{ title: '独立预览', desc: '在浏览器里单独看一遍，不影响当前窗口。' },
						React.createElement(
							'div',
							{ style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
							React.createElement(
								'button',
								{ type: 'button', onClick: () => openPreview('short'), style: UI.button(false) },
								'预览精简版',
							),
							React.createElement(
								'button',
								{ type: 'button', onClick: () => openPreview('long'), style: UI.button(false) },
								'预览剧场版',
							),
						),
					),
					React.createElement(
						Row,
						{ title: '重新播放', desc: '立即在当前窗口重播一次，不用重启应用。' },
						React.createElement(
							'div',
							{ style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
							React.createElement(
								'button',
								{
									type: 'button',
									onClick: () => startReplay('short'),
									disabled: playing,
									style: Object.assign(UI.button(false), playing ? { opacity: 0.6, cursor: 'default' } : null),
								},
								'重播精简版',
							),
							React.createElement(
								'button',
								{
									type: 'button',
									onClick: () => startReplay('long'),
									disabled: playing,
									style: Object.assign(UI.button(true), playing ? { opacity: 0.6, cursor: 'default' } : null),
								},
								playing ? '播放中…' : '重播剧场版',
							),
						),
					),
				),
			);
		}

		exports.name = 'agi-splash';
		exports.inject = ['slots'];
		exports.apply = (ctx) => {
			ctx.effect(
				() => () => {
					removeKeyListener();
					finish();
				},
				'dsh-for-agi-splash: splash teardown',
			);
			/* 自己声明一页，不去挤「通用」的共享列表：四行设置属于一个整体，
			   而 General 是 (priority, order) 平局的共享账本。 */
			if (React === null || ctx.slots === undefined) return;
			ctx.slots.inject('settings.section', () =>
				ctx.slots.register(
					{
						name: 'settings.section',
						id: 'agi-splash',
						order: 40,
						label: () => '开屏动画',
					},
					AgiSplashSettings,
				),
			);
		};

		/* 给设置页和外部脚本留一个入口：window.__dshAgiSplash.replay() */
		try {
			window.__dshAgiSplash = Object.assign({}, window.__dshAgiSplash, {
				replay,
				config: readConfig,
			});
		} catch (error) {}

		return module.exports;
	},
});
