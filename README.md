# DSH-for-AGI 开屏动画

DSH（DeepSeek Harness）的冷启动片头，两套：

- **9.9 秒精简版**：五幕走完 DSH 的真实启动链——**插件装载 → 运行时连接 → 工具接入 → 上下文装配 → 智能体就位**，落在 **AGI** 字标上。
- **30 秒剧场版**：冷启动 → 自检 → 认知网络 → 工具桥接 → 上下文装配 → AGI 就位 → 交棒，七段分镜、三段旁白、一次 0.4 秒静音蓄力。

不是循环播放的 GIF，也不是一次性的视频：画面由 SVG 逐帧绘制，HUD 里跑的是**这台机器上真实的插件与工具**
（宿主会把当前 profile 的 bundle 数、工具数渲染进片头），音轨是逐样本合成的全片音效 + 中文旁白。

## 剧场版 30 秒（装完或升级后的第一次启动）

| 段落 | 画面 | 声音 |
| --- | --- | --- |
| 冷启动 0–3s | 纯黑，中心一点呼吸光，HUD 与网格缓慢亮起 | 28 Hz 低频呼吸 + 一记继电器咔哒 |
| 自检 3–7.5s | 环形扫描、自检文本逐行浮现、28 个插件逐个挂载 | 扫描 whoosh + 28 声挂载 tick + 3 次心跳 |
| 认知网络 7.5–14s | 六边形晶格收敛成线框球，镜头推近 | 上行琶音 + 旁白「认知网络，展开」 |
| 工具桥接 14–19s | 球体裂开缝隙，铜红轨迹注入，10 个工具点亮 | 金属咬合 + 铜线脉冲 + 旁白「工具，接入」 |
| 上下文装配 19–23.5s | 三重轨道加速，粒子被吸入核心，末尾静音蓄力 | 加速 riser + 渐密 tick |
| AGI 就位 23.6–27.4s | 白闪、冲击波、字标炸出、色散收束、横向光带 | 55→28 Hz 冲击 + 和弦 + 旁白「通用人工智能，已就位」 |
| 交棒 27.4–30s | 定版呼吸，亮线拉开，整幅收黑交给真实界面 | 余响 + 末句旁白「一切问题，皆有解」 |

0–27 秒镜头持续缓推，最后 0.4 秒全黑蓄力再炸开——**留白与静音是这版的重点**，不是把 9.9 秒拉长。

## 精简版 9.9 秒

| 五幕 | 画面 | 声音 |
| --- | --- | --- |
| 插件装载 | 28 个真实 bundle 逐个点亮 | 28 声挂载 tick |
| 运行时连接 | 线框球成形、握手光点 | 1046+1568 Hz 双音 ping |
| 工具接入 | 8~10 个工具逐条注册 | 上行 blip + A 小调琶音 |
| 上下文装配 | 同心六边形认知网、对齐弧 | 420→2520 Hz 扫频 + 锁扣 |
| 智能体就位 | AGI 字标 +「通向 AGI 的过渡」 | 冲击 + 六音和弦 + 末句旁白 |

## 安装

桌面版（DSH Desktop）在**设置 → 插件**里安装，或命令行：

```sh
npx @deepseek-ai/dsh plugin --profile desktop add dsh-for-agi-splash
```

从仓库源码安装：

```sh
npx @deepseek-ai/dsh plugin --profile desktop add github:Minksgo/dsh-for-agi-splash
```

npm 页面：<https://www.npmjs.com/package/dsh-for-agi-splash>（包名 `dsh-for-agi-splash`，MIT）。

装完**重启客户端**生效。**装完或升级后的第一次启动播 30 秒剧场版，之后每次 9.9 秒**；
播完自动淡出，随时点击任意处或按 Esc 跳过。之后去 **设置 → 开屏动画** 就能开关、调音量、改提示语、重播。

## 设置 → 开屏动画

装好重启后，**设置 → 开屏动画** 里多一页：

| 行 | 作用 |
| --- | --- |
| 启用开屏动画 | 总开关。关掉后连首帧底色都不画，启动直通界面 |
| 播放模式 | `自动`（升级后第一次播剧场版，其余播精简版）／`每次剧场版`／`每次精简版` |
| 音量 | 0–100%，默认 90%；旁白与音效同一条总线 |
| 跳过提示语 | 画面底部那行字，默认 `点击任意处跳过 · ESC`；留空则不显示 |
| 独立预览 | `预览精简版` → `/dsh-for-agi-splash/preview`；`预览剧场版` → `/preview/30` |
| 重新播放 | 当场重播精简版或剧场版；播放中显示「播放中…」并禁用 |

配置存在渲染进程的 localStorage（前缀 `dsh-for-agi-splash:`：`enabled` / `volume` / `hint` / `mode` / `version`），
**只在本机生效，换机器不跟随**，也不会写进 profile。`version` 只是「这台机器已经看过哪版剧场版」的记号。

## 关掉它

四种方式，任选：

| 方式 | 作用范围 | 做法 |
| --- | --- | --- |
| 设置开关 | 永久（本机） | 设置 → 开屏动画 → 关掉「启用开屏动画」 |
| URL 参数 | 本次会话 | 地址后加 `?agi=0` |
| localStorage | 永久（本机） | 控制台执行 `localStorage.setItem('dsh-for-agi-splash:enabled','0')` |
| 插件开关 | 永久 | 设置 → 插件，关掉本插件 |

旧版留下的 `dsh-for-agi-splash:off` 仍然认：`1` 等价于关掉。
想恢复：打开开关，或删掉对应的键。

## 再看一遍 / 换掉画面

装好后访问 **`/dsh-for-agi-splash/preview`**（精简版）或 **`/dsh-for-agi-splash/preview/30`**（剧场版），
就能不重启重播；地址后加 `?t=12` 可以冻结在任意一秒看细节。

画面源在 `src/scene/agi.html`（精简）与 `src/scene/agi30.html`（剧场），都是自包含网页：SVG 舞台 + 原生 JS，无框架；
音轨在 `assets/agi-boot.mp3` 与 `assets/agi-boot-30.mp3`，剧场版音轨由 `scripts/build-audio-30.mjs` 合成
（Node 逐样本合成 + macOS `say` 旁白 + `ffmpeg` 混音，可复跑）。改完执行：

```sh
node scripts/build-audio-30.mjs   # 仅改了剧场版旁白/配乐时需要
node scripts/build.mjs            # 重新生成 lib/client.js 与两个 preview 页
```

## 它是怎么做到"第一帧就是它"的

DSH 的启动壳会在客户端插件加载前先画一张 `HARNESS / Loading plugins…` 的卡片。
所以片头分两半：

- **宿主半**（`lib/index.js`）通过 `webserver/index-inject` 往 index.html 里塞一条样式和一条同步脚本，
  在 `<head>` 还在解析时就把整屏刷成片头的底色——比启动壳早，因此在任何 z-index 下都不会露出那张卡片。
- **客户端半**（`lib/client.js`）在模块求值的那一刻（比 `apply()` 还早）挂载 shadow root 放上舞台，
  同一个任务里撤掉底色，中间不出一帧空白。两套画面都装在 shadow root 里，按播放模式只显示其中一个容器。

片头挂在 shadow root 里，DSH 的样式进不来、它的样式也漏不出去。禁用插件时 `apply()` 注册的清理回调
会把 overlay 卸掉，不会留下一层透明挡板。

## 兼容性

- DSH `>= 0.2.0-rc.1`（Web 与 Desktop 两种载体都走 `webserver/index-inject`）
- 首帧底色在桌面端的 Electron 与浏览器里都验证过；`prefers-reduced-motion` 下自动走精简版、静音并缩短到约 1.2 秒
- 无外部依赖，无网络请求（两条音轨以 data URI 内联在客户端 bundle 里，bundle 约 0.9 MB）
- 设置页通过 `ctx.slots.register` 注册自己的 `settings.section`（id `agi-splash`，order 40），
  不写官方 General 页的 slot；宿主没提供 React 时只少一页设置，片头照播

## 许可

MIT。画面、音轨、代码都是本项目自绘自合成；字体使用系统字体（PingFang SC / SF Mono / Menlo）。
