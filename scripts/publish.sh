#!/usr/bin/env bash
# 一键发布 dsh-for-agi-splash：npm publish → GitHub 仓库 + topic → awesome-dsh-plugin PR
# 用法：
#   ./scripts/publish.sh            全流程（仓库未满 1 天会自动跳过 PR）
#   ./scripts/publish.sh --check    只体检环境与状态，不动任何东西
#   ./scripts/publish.sh --pr-only  只补提 awesome PR（npm 与仓库已就绪时）
#   ./scripts/publish.sh --no-npm   跳过 npm publish（例如本版本已发过）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$PATH"

CHECK=0; PR_ONLY=0; SKIP_NPM=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    --pr-only) PR_ONLY=1 ;;
    --no-npm) SKIP_NPM=1 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数：$arg"; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 0. 体检 ----------
say "体检"
for c in node npm git gh; do command -v "$c" >/dev/null || die "缺少 ${c}（npm/gh 可装在 ~/.local/bin）"; done
ok "node $(node -v) / npm $(npm -v) / gh $(gh --version | head -1 | awk '{print $3}')"

PKG="$(node -p "require('./package.json').name")"
VER="$(node -p "require('./package.json').version")"
node -e "const p=require('./package.json'); if(!p.dsh||!p.dsh.bundle||!p.dsh.bundle.patch) process.exit(1)" \
  || die "package.json 缺少 dsh.bundle.patch（市场与 awesome 都要求）"
ok "${PKG}@${VER}，dsh.bundle.patch=$(node -p "require('./package.json').dsh.bundle.patch")"

[ -f "$ROOT/cordis.patch.yml" ] || die "缺少 cordis.patch.yml"
[ -f "$ROOT/README.md" ] || die "缺少 README.md"
[ -f "$ROOT/LICENSE" ] || die "缺少 LICENSE"

GH_OK=0; NPM_OK=0
gh auth status >/dev/null 2>&1 && GH_OK=1 || warn "GitHub 未登录：gh auth login --hostname github.com --git-protocol https --web"
npm whoami >/dev/null 2>&1 && NPM_OK=1 || warn "npm 未登录：npm login --auth-type=web"

if git rev-parse --git-dir >/dev/null 2>&1; then
  DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
  [ "$DIRTY" = "0" ] && ok "git 工作区干净" || warn "git 有 $DIRTY 处未提交改动（发布前建议先提交）"
else
  die "当前目录不是 git 仓库"
fi

if [ "$CHECK" = "1" ]; then
  OWNER=""; [ "$GH_OK" = "1" ] && OWNER="$(gh api user -q .login)"
  [ -n "$OWNER" ] && ok "GitHub 登录：$OWNER"
  echo
  say "npm 上是否已有该版本"
  if npm view "$PKG@$VER" version >/dev/null 2>&1; then warn "$PKG@$VER 已存在（要重发请先 bump version）"; else ok "$PKG@$VER 未发布"; fi
  echo
  say "结论"
  [ "$GH_OK" = "1" ] && [ "$NPM_OK" = "1" ] && ok "可以发布：./scripts/publish.sh" || warn "先完成 gh / npm 登录再跑 ./scripts/publish.sh"
  exit 0
fi

[ "$GH_OK" = "1" ] || die "GitHub 未登录，先跑：gh auth login --hostname github.com --git-protocol https --web"
OWNER="$(gh api user -q .login)"
REPO="$OWNER/$PKG"
ok "GitHub：$OWNER"

# ---------- 1. npm publish ----------
if [ "$PR_ONLY" = "0" ] && [ "$SKIP_NPM" = "0" ]; then
  say "npm publish $PKG@$VER"
  if npm view "$PKG@$VER" version >/dev/null 2>&1; then
    warn "$PKG@$VER 已发布，跳过（要重发请 bump version）"
  else
    [ "$NPM_OK" = "1" ] || die "npm 未登录，先跑：npm login --auth-type=web"
    npm publish --access public
    npm view "$PKG@$VER" version >/dev/null || die "npm publish 后仍查不到 $PKG@$VER"
    ok "已发布 https://www.npmjs.com/package/$PKG"
  fi
fi

# ---------- 2. GitHub 仓库 + topic ----------
if [ "$PR_ONLY" = "0" ]; then
  say "GitHub 仓库"
  if gh repo view "$REPO" >/dev/null 2>&1; then
    ok "仓库已存在：https://github.com/$REPO"
    if ! git remote get-url origin >/dev/null 2>&1; then
      git remote add origin "https://github.com/$REPO.git"
      ok "补上 origin remote"
    fi
    git push -u origin HEAD 2>/dev/null || warn "push 失败（可能无新提交或权限不足）"
  else
    gh repo create "$PKG" --public --source=. --remote=origin --push \
      --description "DSH-for-AGI 开屏动画：9.9 秒五幕启动链 + 中文旁白，可跳过、可配置"
    ok "已创建 https://github.com/$REPO"
  fi
  gh repo edit "$REPO" --add-topic dsh-plugin --add-topic dsh --add-topic splash-screen --add-topic boot-animation >/dev/null
  ok "topics：dsh-plugin / dsh / splash-screen / boot-animation"

  if git tag -l | grep -qx "v$VER"; then
    git push origin "v$VER" 2>/dev/null || true
  else
    git tag "v$VER" && git push origin "v$VER" && ok "打了 tag v$VER"
  fi
fi

# ---------- 3. awesome-dsh-plugin PR ----------
say "awesome-dsh-plugin PR"
CREATED="$(gh api "repos/$REPO" -q .created_at)"
if [ -z "$CREATED" ]; then
  warn "取不到仓库创建时间（无 gh 权限），跳过 PR"
  exit 0
fi
CREATED_TS="$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$CREATED" +%s 2>/dev/null || date -u -d "$CREATED" +%s)"
AGE_H=$(( ( $(date -u +%s) - CREATED_TS ) / 3600 ))
if [ "$AGE_H" -lt 24 ]; then
  warn "仓库才 $AGE_H 小时，awesome 要求满 1 天；约 $((24-AGE_H)) 小时后再跑：./scripts/publish.sh --pr-only"
  exit 0
fi
ok "仓库已 $AGE_H 小时，满足 1 天门槛"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(
  cd "$TMP"
  if gh repo view "$OWNER/awesome-dsh-plugin" >/dev/null 2>&1; then
    gh repo clone "$OWNER/awesome-dsh-plugin" awesome >/dev/null
    cd awesome
    git remote add upstream https://github.com/awesome-dsh-plugin/awesome-dsh-plugin.git 2>/dev/null || true
    git fetch upstream main --quiet
    git checkout -B "add-$PKG" upstream/main --quiet
  else
    gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=true --remote=false >/dev/null
    cd awesome-dsh-plugin
    git checkout -b "add-$PKG" --quiet
  fi

  mkdir -p data/plugins
  ENTRY="data/plugins/${OWNER}__${PKG}.yml"
  [ -f "$ENTRY" ] && { echo "  条目已存在：$ENTRY"; exit 0; }
  sed "s/<owner>/$OWNER/g" "$ROOT/publish/awesome-entry.yml" > "$ENTRY"
  git add "$ENTRY"
  git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" \
      commit -m "Add $OWNER/$PKG" --quiet
  git push -u origin "add-$PKG" --quiet
  PR_URL="$(gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
      --title "Add $OWNER/$PKG" \
      --body-file <(sed "s/<owner>/$OWNER/g" "$ROOT/publish/pr-body.md") \
      --head "$OWNER:add-$PKG" 2>&1 | tail -1)"
  echo "  PR: $PR_URL"
)
ok "PR 流程结束（上面是链接；已有未合 PR 时会提示）"
