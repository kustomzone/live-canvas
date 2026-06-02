#!/bin/zsh
# 通用停用器:按 job 名从系统 crontab 摘除对应条目(不删脚本/日志)。
#
# 用法:
#   ./kill.sh <job名>      # 停用指定 job
#   ./kill.sh --list       # 列出本工具安装的所有 job
#   ./kill.sh --all        # 停用本工具安装的所有 job
set -u

ARG="${1:-}"

list_jobs() {
  crontab -l 2>/dev/null | grep -oE '# cron-job:[^ ]+' | sed 's/# cron-job://' | sort -u
}

if [[ -z "$ARG" ]]; then
  echo "用法: $0 <job名> | --list | --all" >&2
  echo "已安装的 job:" >&2
  list_jobs | sed 's/^/  - /' >&2
  exit 1
fi

if [[ "$ARG" == "--list" ]]; then
  echo "已安装的 job:"
  list_jobs | sed 's/^/  - /'
  exit 0
fi

if [[ "$ARG" == "--all" ]]; then
  CUR="$(crontab -l 2>/dev/null)"
  if ! print -r -- "$CUR" | grep -q '# cron-job:'; then
    echo "没有本工具安装的 job。"
    exit 0
  fi
  print -r -- "$CUR" | grep -v '# cron-job:' | crontab -
  echo "已移除全部 cron-job 条目。"
  echo "--- 当前 crontab ---"; crontab -l 2>/dev/null || echo "(空)"
  exit 0
fi

# 停用单个 job
MARKER="# cron-job:${ARG}"
CUR="$(crontab -l 2>/dev/null)"
if ! print -r -- "$CUR" | grep -q -F "$MARKER"; then
  echo "未找到 job '${ARG}'。现有 job:"
  list_jobs | sed 's/^/  - /'
  exit 1
fi

print -r -- "$CUR" | grep -v -F "$MARKER" | crontab -
echo "已停用 job '${ARG}'。"
echo "--- 当前 crontab ---"; crontab -l 2>/dev/null || echo "(空)"
