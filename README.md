# DSH-for-AGI 开屏动画

DSH（DeepSeek Harness）的冷启动片头：9.9 秒，五幕走完 DSH 的真实启动链——
**插件装载 → 运行时连接 → 工具接入 → 上下文装配 → 智能体就位**，最后落在 **AGI** 字标上。

不是循环播放的 GIF，也不是一次性的视频：画面由 SVG 逐帧绘制，HUD 里跑的是**这台机器上真实的插件与工具**
（宿主会把当前 profile 的 bundle 数、工具数渲染进片头），音轨是逐样本合成的全片音效 + 中文旁白。

```
五幕            画面                                   声音
插件装载        28 个真实 bundle 逐个点亮               28 声挂载 tick
运行时连接      线框球成形、握手光点                    1046+1568 Hz 双音 ping
工具接入        8~10 个工具逐条注册                    上行 blip + A 小调琶音
上下文装配      同心六边形认知网、对齐弧                 420→2520 Hz 扫频 + 锁扣
智能体就位      AGI 字标 +「通向 AGI 的过渡」           冲击 + 六音和弦 + 末句旁白
```

## 安装

桌面版（DSH Desktop）在**设置 → 插件**里安装，或命令行：

```sh
npx @deepseek-ai/dsh plugin --profile desktop add dsh-for-agi-splash
```

从仓库源码安装：

```sh
npx @deepseek-ai/dsh plugin --profile desktop add github:<你的账号>/DSH-for-AGI开屏动画
```

装完**重启客户端**生效。片头只播一次，播完自动淡出。

## 关掉它

三种方式，任选：

| 方式 | 作用范围 | 做法 |
| --- | --- | --- |
| URL 参数 | 本次会话 | 地址后加 `?agi=0` |
| localStorage | 永久（本机） | 控制台执行 `localStorage.setItem('dsh-for-agi-splash:off','1')` |
| 插件开关 | 永久 | 设置 → 插件，关掉本插件 |

想恢复：把键删掉（`localStorage.removeItem('dsh-for-agi-splash:off')`）或重新打开插件。

## 再看一遍 / 换掉画面

装好后访问 **`/dsh-for-agi-splash/preview`**（同一个地址栏），就能不重启重播；
地址后加 `?t=4.9` 可以冻结在任意一秒看细节。

画面源在 `src/scene/agi.html`（一个自包含的网页：SVG 舞台 + 原生 JS，无框架）；
音轨在 `assets/agi-boot.mp3`。改完执行：

```sh
node scripts/build.mjs   # 重新生成 lib/client.js 与 preview/splash.html
```

## 它是怎么做到"第一帧就是它"的

DSH 的启动壳会在客户端插件加载前先画一张 `HARNESS / Loading plugins…` 的卡片。
所以片头分两半：

- **宿主半**（`lib/index.js`）通过 `webserver/index-inject` 往 index.html 里塞一条样式和一条同步脚本，
  在 `<head>` 还在解析时就把整屏刷成片头的底色——比启动壳早，因此在任何 z-index 下都不会露出那张卡片。
- **客户端半**（`lib/client.js`）在模块求值的那一刻（比 `apply()` 还早）挂载 shadow root 放上舞台，
  同一个任务里撤掉底色，中间不出一帧空白。

片头挂在 shadow root 里，DSH 的样式进不来、它的样式也漏不出去。禁用插件时 `apply()` 注册的清理回调
会把 overlay 卸掉，不会留下一层透明挡板。

## 兼容性

- DSH `>= 0.2.0-rc.1`（Web 与 Desktop 两种载体都走 `webserver/index-inject`）
- 首帧底色在桌面端的 Electron 与浏览器里都验证过；`prefers-reduced-motion` 下会静音并缩短到约 1.2 秒
- 无外部依赖，无网络请求（音频以 data URI 内联在客户端 bundle 里）

## 许可

MIT。画面、音轨、代码都是本项目自绘自合成；字体使用系统字体（PingFang SC / SF Mono / Menlo）。
