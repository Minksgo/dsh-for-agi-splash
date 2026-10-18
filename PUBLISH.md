# 发布到 DSH 插件市场

市场（dshmarket）本身不是插件目录：上架 = **GitHub 仓库 + npm 包 + 向 awesome-dsh-plugin 提 PR**，站点与市场会自动收录（约一天生效）。
目录源：`https://awesome-dsh-plugin.com/plugins.json`；收录仓库：`github.com/awesome-dsh-plugin/awesome-dsh-plugin`。

## 0. 本机现状

本机没有全局 node/npm/gh（只有桌面版自带的 node 可执行文件），所以下面第 2、3 步需要先装 Node（`brew install node`）或换一台有 npm 的机器。

## 1. 推到 GitHub

```bash
cd ~/Desktop/DSH-for-AGI开屏动画
# 建议仓库名与 npm 包名一致，便于市场与 profile 解析
gh repo create dsh-for-agi-splash --public --source=. --push
# 或用网页建空仓库后：
# git remote add origin git@github.com:<你的账号>/dsh-for-agi-splash.git && git push -u origin main
```

## 2. 发布 npm 包

```bash
npm login
npm publish ./dsh-for-agi-splash-0.1.0.tgz   # 或在本目录 npm publish
```

包名 `dsh-for-agi-splash`，体积约 330 KB，运行期零依赖。

## 3. 向 awesome-dsh-plugin 提 PR

Fork `awesome-dsh-plugin/awesome-dsh-plugin`，在其 README 的插件列表里**按字母序**插入一行：

```markdown
- [<你的账号>/dsh-for-agi-splash](https://github.com/<你的账号>/dsh-for-agi-splash) - DSH-for-AGI 开屏动画：9.9 秒五幕启动链 + 中文旁白 + 全片音效，可跳过。
```

PR 合并后，DSH 插件市场（含 1024Store 等合作目录）会自动抓取，通常一天内出现在搜索结果里。

## 4. 自测安装（发布前先确认别人装得上）

```bash
dsh plugin --profile desktop add dsh-for-agi-splash
```

或在插件市场里搜索「DSH-for-AGI」直接安装；装完重启桌面应用生效。

## 5. 版本升级

改 `version` → `npm run build` → 重新 `npm publish` → 市场按新版本号自动更新。
