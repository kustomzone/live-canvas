#!/bin/zsh
# 通用停用器:按 job 名从系统 crontab 摘除对应条目(不删脚本/日志),
# 并可选地杀掉该 job 正在运行的进程(含独立进程组的子进程,如 build_canvases.mjs)。
#
# 用法:
#   ./kill.sh <job名>              # 仅从 crontab 摘除条目(不动正在跑的进程)
#   ./kill.sh <job名> --running    # 摘除条目 + 杀掉正在跑的进程
#   ./kill.sh --running <job名>    # 仅杀掉正在跑的进程,保留 crontab 条目
#   ./kill.sh --list               # 列出本工具安装的所有 job
#   ./kill.sh --all                # 停用本工具安装的所有 job(不杀进程)
set -u

SCRIPT_DIR="${0:A:h}"   # .../.codebuddy/cron

list_jobs() {
  crontab -l 2>/dev/null | grep -oE '# cron-job:[^ ]+' | sed 's/# cron-job://' | sort -u
}

# 递归收集一个 PID 的全部后代(含自身),趁进程树还完整时一次性抓全,
# 避免父进程先死后子进程(尤其是另起进程组的)变孤儿杀不到。
collect_descendants() {
  local root="$1"
  echo "$root"
  local child
  for child in $(pgrep -P "$root" 2>/dev/null); do
    collect_descendants "$child"
  done
}

# 杀掉某个 job 正在运行的所有进程。
kill_running() {
  local job="$1"
  local launcher="${SCRIPT_DIR}/${job}.sh"

  # 1) 找到该 job 的 launcher 进程(按脚本绝对路径精确匹配)
  local roots
  roots=($(pgrep -f "$launcher" 2>/dev/null))

  # 2) 兜底:build_canvases.mjs 由 sh -c 另起进程组,父死后会成孤儿(PPID=1),
  #    单靠后代遍历可能漏掉,这里按命令特征补抓(仅 hot-canvas 系任务会用到)。
  local strays
  strays=($(pgrep -f 'build_canvases\.mjs' 2>/dev/null))

  if [[ ${#roots} -eq 0 && ${#strays} -eq 0 ]]; then
    echo "没有正在运行的 '${job}' 进程。"
    return 0
  fi

  # 收集所有目标 PID(launcher 全部后代 + strays),去重
  local -a pids
  local r
  for r in $roots; do
    pids+=($(collect_descendants "$r"))
  done
  pids+=($strays)
  pids=(${(u)pids})   # 去重

  echo "正在停止 '${job}',目标进程: ${pids}"

  # 先 TERM
  kill -TERM ${pids} 2>/dev/null
  local i
  for i in 1 2 3 4 5; do
    sleep 1
    # 还活着的
    local -a alive
    alive=()
    local p
    for p in $pids; do
      kill -0 "$p" 2>/dev/null && alive+=("$p")
    done
    if [[ ${#alive} -eq 0 ]]; then
      echo "已全部退出(TERM)。"
      return 0
    fi
    pids=($alive)
  done

  # TERM 后仍有残留 → KILL
  echo "以下进程未响应 TERM,改用 KILL: ${pids}"
  kill -KILL ${pids} 2>/dev/null
  sleep 1
  local -a still
  still=()
  local p2
  for p2 in $pids; do
    kill -0 "$p2" 2>/dev/null && still+=("$p2")
  done
  if [[ ${#still} -eq 0 ]]; then
    echo "已全部退出(KILL)。"
  else
    echo "警告:仍有进程存活: ${still}(可能权限不足,需手动处理)。" >&2
  fi
}

# 从 crontab 摘除某个 job 条目
remove_cron() {
  local job="$1"
  local marker="# cron-job:${job}"
  local cur
  cur="$(crontab -l 2>/dev/null)"
  if ! print -r -- "$cur" | grep -q -F "$marker"; then
    echo "crontab 中未找到 job '${job}'。"
    return 1
  fi
  print -r -- "$cur" | grep -v -F "$marker" | crontab -
  echo "已从 crontab 停用 job '${job}'。"
  return 0
}

# ===== 参数解析 =====
ARG="${1:-}"
ARG2="${2:-}"

if [[ -z "$ARG" ]]; then
  echo "用法: $0 <job名> [--running] | --running <job名> | --list | --all" >&2
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
  echo "已移除全部 cron-job 条目(未杀进程;如需停止运行中的任务,用 --running)。"
  echo "--- 当前 crontab ---"; crontab -l 2>/dev/null || echo "(空)"
  exit 0
fi

# --running <job名>:只杀进程,不动 crontab
if [[ "$ARG" == "--running" ]]; then
  if [[ -z "$ARG2" ]]; then
    echo "用法: $0 --running <job名>" >&2
    exit 1
  fi
  kill_running "$ARG2"
  exit 0
fi

# <job名> [--running]
JOB="$ARG"
remove_cron "$JOB"
if [[ "$ARG2" == "--running" ]]; then
  kill_running "$JOB"
fi
echo "--- 当前 crontab ---"; crontab -l 2>/dev/null || echo "(空)"
