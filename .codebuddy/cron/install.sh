#!/bin/zsh
# 通用安装器:把一个 launcher 脚本注册成系统 crontab 定时任务。
# 用唯一 job 名做标记,可安装多个任务互不干扰。
#
# 用法:
#   ./install.sh <launcher脚本> [cron表达式] [job名]
#
# 示例:
#   ./install.sh run-hot-canvas.sh "0 11 * * *" hot-canvas
#   ./install.sh /abs/path/run-foo.sh "30 9 * * 1-5" foo
#
# 省略 cron表达式默认 "0 11 * * *";省略 job名默认取 launcher 文件名(去扩展名)。
set -u

LAUNCHER_ARG="${1:-}"
SCHEDULE="${2:-0 11 * * *}"
JOB="${3:-}"

if [[ -z "$LAUNCHER_ARG" ]]; then
  echo "用法: $0 <launcher脚本> [cron表达式] [job名]" >&2
  exit 1
fi

# launcher 解析为绝对路径(相对路径按本脚本所在目录找)
if [[ "$LAUNCHER_ARG" = /* ]]; then
  LAUNCHER="$LAUNCHER_ARG"
else
  LAUNCHER="${0:A:h}/${LAUNCHER_ARG}"
fi
LAUNCHER="${LAUNCHER:A}"   # 规范化

[[ -x "$LAUNCHER" ]] || { echo "launcher 不可执行: $LAUNCHER" >&2; exit 1; }

# job 名默认 = launcher 文件名去扩展名
if [[ -z "$JOB" ]]; then
  JOB="${${LAUNCHER:t:r}}"
fi

MARKER="# cron-job:${JOB}"

# 先按 MARKER 去重(移除同名旧条目),再追加
CUR="$(crontab -l 2>/dev/null | grep -v -F "$MARKER")"
{
  print -r -- "$CUR"
  echo "$SCHEDULE $LAUNCHER $MARKER"
} | crontab -

echo "已安装 job '${JOB}': ${SCHEDULE} -> ${LAUNCHER}"
echo "--- 当前 crontab ---"
crontab -l
