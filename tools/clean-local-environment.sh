#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f "$ROOT/tools/native-workspace.js" ] || ! grep -q '"name": "myproxyrules"' "$ROOT/package.json"; then
  echo "拒绝清理：当前目录未通过 myProxyRules 仓库检查（$ROOT）。" >&2
  exit 1
fi
if [ -L "$ROOT/.local" ] || [ -L "$ROOT/node_modules" ]; then
  echo "拒绝清理：检测到指向工作区外部的链接，未删除其目标。" >&2
  exit 1
fi

rm -rf "$ROOT/.local" "$ROOT/node_modules"
echo "已清除项目内 Node/npm 工具链、npm 缓存、依赖、Mihomo、规则快照和临时文件。"
echo "跟踪的源文件和配置未修改；下次使用前运行 ./tools/bootstrap-local-environment.sh。"
