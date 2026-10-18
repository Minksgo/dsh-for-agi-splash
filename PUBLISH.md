# 发布到 DSH 插件市场

上架不是"提交一个市场后台"，而是三条流水线各走一遍，互相独立、都会自动校验：

| 目标 | 载体 | 硬门槛 |
| --- | --- | --- |
| 能被 `dsh plugin add` / 市场一键安装 | **npm 包** | `package.json` 里有 `dsh.bundle.patch`，且 market 只装 npm `latest` 的**精确稳定版** |
| 能进 awesome 列表（含 dsh-market 目录） | **GitHub 仓库** | 仓库带 `dsh-plugin` topic、**创建满 1 天**、同样的 `dsh.bundle` 声明 |
| 别人搜得到 | **一个 YAML 文件** | 向 awesome-dsh-plugin 提 PR，加 `data/plugins/<owner>__<repo>.yml` |

目录源：`https://awesome-dsh-plugin.com/plugins.json`（收录后自动生成，别手改 README）。

---

## 0. 本机现状（2026-10-18）

| 项 | 状态 |
| --- | --- |
| 本地插件 v0.2.0，已装进 desktop profile（`link:`，重启生效） | ✅ |
| `package.json` → `dsh.bundle.patch: ./cordis.patch.yml` | ✅ |
| npm 包名 `dsh-for-agi-splash` 未被占用（registry 404） | ✅ |
| `npm pack` 体检：7 文件 / 341 kB / 零运行期依赖 | ✅ |
| Node v24.22.0 + npm 11.19.1 + gh 2.102.0（装在 `~/.local`，无 sudo） | ✅ |
| npm 登录 | ⏳ 待授权：后台已开 `npm login --auth-type=web` |
| GitHub 登录 / 仓库 | ✅ Minksgo；仓库已建并推 main + tag v0.2.0 |
| awesome PR | ⏳ 等仓库满 1 天（脚本会自动跳过并提示 `--pr-only`） |

GitHub 这一步已经完成（2026-10-18 14:38），现在只差 **npm 授权**。

```bash
export PATH="$HOME/.local/bin:$PATH"
node -v && npm -v && gh --version   # v24.22.0 / 11.19.1 / 2.102.0

gh auth login --hostname github.com --git-protocol https --web
npm login --auth-type=web
```

授权完，这两条命令等价于第 1～3 步全自动：

```bash
cd ~/Desktop/DSH-for-AGI开屏动画
./scripts/publish.sh            # 发 npm + 建仓库 + 打 topic + 提 PR（仓库未满 1 天会自动跳过 PR）
./scripts/publish.sh --pr-only  # 仓库满 1 天后单独补 PR
```

---

## 1. 发 npm（先发这个，市场靠它装包）

```bash
cd ~/Desktop/DSH-for-AGI开屏动画
node scripts/build.mjs          # 改过 src/ 或 assets/ 才需要
npm pack --dry-run              # 看清单：lib/ preview/ cordis.patch.yml README LICENSE
npm publish --access public
npm view dsh-for-agi-splash version dist.tarball
```

规则：

- **每次发版必须 bump `version`**，同版本号 publish 会被拒；市场也只认 npm `latest`。
- `files` 只放运行期需要的 7 个文件；`src/`、`assets/`、`scripts/` 不进包（`lib/client.js` 已内联音轨与画面）。
- 发布后 `npm view` 要能看到 `latest` 与 `dist.tarball`；market 端会去 `https://registry.npmjs.org/<pkg>/latest` 校验包名、版本、`dsh.bundle.patch`。
- 回滚只能 `npm deprecate`（72 小时内才允许 unpublish）；用户侧降级靠 `npm install <pkg>@<旧版本>`。

## 2. 建 GitHub 仓库（awesome 用，也让别人能 `github:` 装）

```bash
cd ~/Desktop/DSH-for-AGI开屏动画
gh repo create dsh-for-agi-splash --public --source=. --remote=origin --push \
  --description "DSH-for-AGI 开屏动画：9.9 秒五幕启动链 + 中文旁白，可跳过、可配置"
gh repo edit --add-topic dsh-plugin --add-topic dsh --add-topic splash-screen --add-topic boot-animation
git push --tags 2>/dev/null || true
```

- **仓库名 = npm 包名**（`dsh-for-agi-splash`），本地目录名是中文，不影响。
- topic 必须有 `dsh-plugin`，否则 awesome 的自动校验直接红。
- 仓库**创建满 1 天**才收 PR；今天建仓，今天就能发 npm、能自测，明天再提 PR。

## 3. 提 awesome-dsh-plugin PR（加一个 YAML，不改 README）

```bash
cd "$(mktemp -d)"
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=true --remote=false
cd awesome-dsh-plugin
git checkout -b add-dsh-for-agi-splash
mkdir -p data/plugins
cp ~/Desktop/DSH-for-AGI开屏动画/publish/awesome-entry.yml data/plugins/<owner>__dsh-for-agi-splash.yml
git add data/plugins/<owner>__dsh-for-agi-splash.yml
git commit -m "Add <owner>/dsh-for-agi-splash"
git push -u origin add-dsh-for-agi-splash
gh pr create --title "Add <owner>/dsh-for-agi-splash" --body-file ~/Desktop/DSH-for-AGI开屏动画/publish/pr-body.md
```

条目内容（`publish/awesome-entry.yml`，把 `<owner>` 换成你的 GitHub 登录名）：

```yaml
url: https://github.com/<owner>/dsh-for-agi-splash
name: <owner>/dsh-for-agi-splash
category: ui
description:
  en: '...'
  zh: ...
```

- `category`：开屏/皮肤类填 `ui`；Themes & Appearance 分类的条目才会进 dsh-market 的 Themes 页。
- 两个描述都以句号结尾，英文单行、中文单行。
- PR 自动校验三件事：`dsh.bundle` manifest、仓库是否满 1 天、仓库 topic。合并后 README 由 main 自动重建，约一天进 `plugins.json` 与市场搜索结果。

## 4. 发布后验证

```bash
npm view dsh-for-agi-splash version                 # 1. npm 已上
curl -fsS https://awesome-dsh-plugin.com/plugins.json | grep -c dsh-for-agi-splash   # 2. 已收录（1）
```

3. 干净环境实测：`npx @deepseek-ai/dsh plugin --profile web add dsh-for-agi-splash` → 重启 → 片头播一遍 → 设置里能开关。
4. 市场实测：设置 → 插件 → 搜索「开屏动画」→ 安装 → 重启。

## 5. 版本升级

```bash
# 改 src/ 或 README 后
npm version patch --no-git-tag-version   # 或手动改 version
node scripts/build.mjs
git commit -am "v0.2.1: ..."
npm publish --access public
git tag v0.2.1 && git push --follow-tags
```

市场按 npm 新版本自动更新；awesome 条目不用重提。

## 6. 卸载 / 回滚

```bash
# 用户侧（桌面版）：profile 里删依赖与 bundle 名，再重装依赖，重启
# ~/.dsh/profiles/desktop/package.json:
#   dependencies 去掉 "dsh-for-agi-splash"
#   dsh.profile.bundles 去掉 "dsh-for-agi-splash"
# 然后跑 profile 的 pnpm install 并重启桌面应用
```

插件自身出问题时的紧急开关：设置 → 开屏动画 → 关；或地址栏 `?agi=0`；或 `localStorage.setItem('dsh-for-agi-splash:enabled','0')`。
