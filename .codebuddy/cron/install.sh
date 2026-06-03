#!/bin/zsh
# 通用安装器:把一个业务脚本注册成系统 crontab 定时任务。
# crontab 命令统一走 wrapper.sh(负责 cron 环境引导:source ~/.zshrc / PATH 加固 /
# 清 ANTHROPIC_*),业务脚本作为参数传给它。用唯一 job 名做标记,可安装多个互不干扰。
#
# 用法:
#   ./install.sh <业务脚本> [cron表达式] [job名]
#
# 示例:
#   ./install.sh hot-canvas-to-social.sh "0 11 * * *" hot-canvas-to-social
#   ./install.sh /abs/path/run-foo.sh "30 9 * * 1-5" foo
#
# 省略 cron表达式默认 "0 10 * * *";省略 job名默认取业务脚本文件名(去扩展名)。
set -u

SCRIPT_DIR="${0:A:h}"             # .../.codebuddy/cron
WRAPPER="${SCRIPT_DIR}/wrapper.sh"

TARGET_ARG="${1:-}"
SCHEDULE="${2:-0 10 * * *}"
# SCHEDULE="${2:-22 12 * * *}"
JOB="${3:-}"

if [[ -z "$TARGET_ARG" ]]; then
  echo "用法: $0 <业务脚本> [cron表达式] [job名]" >&2
  exit 1
fi

[[ -x "$WRAPPER" ]] || { echo "wrapper 不可执行: $WRAPPER" >&2; exit 1; }

# 业务脚本解析为绝对路径(相对路径按本脚本所在目录找)
if [[ "$TARGET_ARG" = /* ]]; then
  TARGET="$TARGET_ARG"
else
  TARGET="${SCRIPT_DIR}/${TARGET_ARG}"
fi
TARGET="${TARGET:A}"   # 规范化

[[ -x "$TARGET" ]] || { echo "业务脚本不可执行: $TARGET" >&2; exit 1; }

# job 名默认 = 业务脚本文件名去扩展名
if [[ -z "$JOB" ]]; then
  JOB="${TARGET:t:r}"
fi

MARKER="# cron-job:${JOB}"

# crontab 命令行:wrapper 在前,业务脚本作参数。
# kill.sh 按业务脚本路径($TARGET)定位进程,wrapper 进程命令行含该路径,可被匹配。
CMD="${WRAPPER} ${TARGET}"

# 先按 MARKER 去重(移除同名旧条目),再追加。
# 仅当已有内容非空时才输出它,避免 crontab 顶部留空行。
CUR="$(crontab -l 2>/dev/null | grep -v -F "$MARKER")"
{
  [[ -n "$CUR" ]] && print -r -- "$CUR"
  echo "$SCHEDULE $CMD $MARKER"
} | crontab -

echo "已安装 job '${JOB}': ${SCHEDULE} -> ${CMD}"
echo "--- 当前 crontab ---"
crontab -l
